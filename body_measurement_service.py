"""
body_measurement_service.py

Wraps the FitVerse_Detect_Size_Module notebook's detect_size() pipeline
(MediaPipe Pose Landmarker + segmentation-based measurements) as a small local
HTTP service that server.ts calls instead of Qwen Vision.

This is the SAME logic that's in the notebook -- classify_body_shape(),
map_to_size(), detect_size(), and their helpers -- just moved out of Colab
cells into one importable/runnable file, with the Colab-only bits
(google.colab.files, cv2_imshow) removed since they're not needed here.

Install:
    pip install flask flask-cors mediapipe opencv-python numpy

Run (separate terminal from `npm run dev`):
    python body_measurement_service.py

It listens on http://localhost:5001. The model file (pose_landmarker_heavy.task,
~30MB) downloads automatically on first run if not already present.
"""

import os
import base64
import tempfile
import urllib.request

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from flask import Flask, request, jsonify
from flask_cors import CORS

# --- Skeleton drawing (ported from the notebook, cell 5) ---
POSE_CONNECTIONS = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),   # shoulders and arms
    (11, 23), (12, 24), (23, 24),                        # torso
    (23, 25), (25, 27), (27, 29), (27, 31),              # left leg
    (24, 26), (26, 28), (28, 30), (28, 32),              # right leg
    (0, 1), (1, 2), (2, 3), (3, 7),                       # face
    (0, 4), (4, 5), (5, 6), (6, 8),
]


def draw_landmarks_manual(rgb_image, detection_result):
    annotated_image = np.copy(rgb_image)
    h, w, _ = annotated_image.shape
    for pose_landmarks in detection_result.pose_landmarks:
        points = [(int(lm.x * w), int(lm.y * h)) for lm in pose_landmarks]
        for start_idx, end_idx in POSE_CONNECTIONS:
            cv2.line(annotated_image, points[start_idx], points[end_idx], (0, 255, 0), 2)
        for point in points:
            cv2.circle(annotated_image, point, 4, (0, 0, 255), -1)
    return annotated_image


def draw_measurement_overlay(rgb_image, detection_result, measurements, shoulder_y, waist_y_norm, hip_y):
    """Skeleton + horizontal reference lines with the measured cm value labeled
    at each one -- visual proof the model actually measured this specific
    photo, matching the reference-line figures in the project proposal."""
    annotated = draw_landmarks_manual(rgb_image, detection_result)
    h, w = annotated.shape[:2]

    lines = [
        ("Shoulder", shoulder_y, measurements.get("shoulder")),
        ("Waist", int(waist_y_norm * h), measurements.get("waist")),
        ("Hip", hip_y, measurements.get("hip")),
    ]
    colors = {"Shoulder": (255, 200, 0), "Waist": (0, 165, 255), "Hip": (255, 0, 255)}

    for label, y, value_cm in lines:
        if value_cm is None or y is None:
            continue
        color = colors[label]
        cv2.line(annotated, (0, y), (w, y), color, 2)
        text = f"{label}: {value_cm} cm"
        cv2.putText(annotated, text, (10, max(20, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    return annotated

# --- Model setup (same model as the notebook) ---
MODEL_PATH = "pose_landmarker.task"
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task"

if not os.path.exists(MODEL_PATH):
    print("Downloading pose landmarker model (one-time, ~30MB)...")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    print("Model downloaded.")

base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
options = vision.PoseLandmarkerOptions(base_options=base_options, output_segmentation_masks=True)
detector = vision.PoseLandmarker.create_from_options(options)
print("Pose landmarker model loaded.")


# --- Helpers (ported unchanged from the notebook) ---

def euclidean_pixel(p1, p2, w, h):
    x1, y1 = p1.x * w, p1.y * h
    x2, y2 = p2.x * w, p2.y * h
    return np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


def measure_width_at_height(detection_result, y_normalized, image_shape):
    mask = detection_result.segmentation_masks[0].numpy_view()
    h, w = mask.shape[:2]
    y_px = int(y_normalized * h)
    row = mask[y_px, :] > 0.5
    if row.sum() == 0:
        return None
    xs = np.where(row)[0]
    return xs.max() - xs.min()


def find_waist_from_mask(detection_result, landmarks, image_shape, safety_margin=0.15):
    mask = detection_result.segmentation_masks[0].numpy_view()
    h, w = mask.shape[:2]

    shoulder_y = int(((landmarks[11].y + landmarks[12].y) / 2) * h)
    hip_y = int(((landmarks[23].y + landmarks[24].y) / 2) * h)
    torso_height = hip_y - shoulder_y

    search_start = shoulder_y + int(torso_height * safety_margin)
    search_end = hip_y - int(torso_height * 0.1)

    min_width = float("inf")
    waist_y = search_start
    waist_x_left, waist_x_right = 0, 0

    for y in range(search_start, search_end):
        row = mask[y, :] > 0.5
        if row.sum() == 0:
            continue
        xs = np.where(row)[0]
        width = xs.max() - xs.min()
        if width < min_width:
            min_width = width
            waist_y = y
            waist_x_left, waist_x_right = xs.min(), xs.max()

    return {
        "waist_y_normalized": waist_y / h,
        "waist_width_px": min_width,
        "left_x": waist_x_left,
        "right_x": waist_x_right,
    }


def find_waist_hybrid(detection_result, landmarks, image_shape, shoulder_y, hip_y):
    h, w = image_shape[:2]
    torso_height = hip_y - shoulder_y

    mask_result = find_waist_from_mask(detection_result, landmarks, image_shape)
    relative_position = (mask_result["waist_y_normalized"] * h - shoulder_y) / torso_height

    if 0.35 <= relative_position <= 0.65:
        mask_result["method"] = "segmentation"
        mask_result["confidence"] = "high"
        return mask_result
    else:
        fallback_ratio = 0.55
        waist_y = shoulder_y + int(torso_height * fallback_ratio)
        return {
            "waist_y_normalized": waist_y / h,
            "method": "proportional_fallback",
            "confidence": "low",
            "reason": "segmentation result outside plausible torso range (likely loose garment)",
        }


def classify_body_shape(measurements):
    """Unified taxonomy: pear | hourglass | apple | rectangle | inverted_triangle"""
    shoulder = measurements.get("shoulder")
    waist = measurements.get("waist")
    hip = measurements.get("hip")

    if shoulder is None or waist is None or hip is None:
        return "unknown"

    shoulder_hip_diff = shoulder - hip
    waist_vs_smaller = min(shoulder, hip) - waist

    if abs(shoulder_hip_diff) < 10 and abs(waist - hip) < 10:
        return "rectangle"
    if abs(shoulder_hip_diff) < 8 and waist_vs_smaller >= 15:
        return "hourglass"
    if abs(waist - hip) < 10 and waist_vs_smaller < 15:
        return "apple"
    if hip - shoulder >= 8:
        return "pear"
    if shoulder - hip >= 8:
        return "inverted_triangle"
    return "rectangle"


def map_to_size(measurements):
    # NOTE: same placeholder thresholds as the notebook -- replace with a real
    # brand size chart before production use.
    SIZE_CHART = {
        "S": {"shoulder_max": 40, "hip_max": 90},
        "M": {"shoulder_max": 44, "hip_max": 100},
        "L": {"shoulder_max": 48, "hip_max": 110},
    }
    for size, limits in SIZE_CHART.items():
        if measurements.get("shoulder", 999) <= limits["shoulder_max"]:
            return size
    return "XL"


def detect_size(image_path, real_height_cm):
    # Load via OpenCV instead of mp.Image.create_from_file(): cv2.imread's
    # default flag always returns 3-channel BGR.
    bgr = cv2.imread(image_path)
    if bgr is None:
        raise ValueError("Could not decode the uploaded image")

    # Known MediaPipe bug (github.com/google-ai-edge/mediapipe/issues/6331,
    # present in every release 0.10.30 through 1.0.0): calling numpy_view() on
    # the segmentation mask hard-aborts the WHOLE PROCESS (uncatchable SIGABRT,
    # not a normal Python exception) whenever the image width isn't a multiple
    # of 4 pixels. Pad the right edge (replicating the border, so it doesn't
    # distort the measured silhouette) until width % 4 == 0.
    h, w = bgr.shape[:2]
    pad = (4 - w % 4) % 4
    if pad:
        bgr = cv2.copyMakeBorder(bgr, 0, 0, 0, pad, cv2.BORDER_REPLICATE)

    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

    detection_result = detector.detect(image)

    if not detection_result.pose_landmarks:
        raise ValueError("No person detected in the image")

    landmarks = detection_result.pose_landmarks[0]
    h, w = image.numpy_view().shape[:2]

    pixel_height = euclidean_pixel(landmarks[0], landmarks[27], w, h)
    scale = real_height_cm / pixel_height

    shoulder_px = euclidean_pixel(landmarks[11], landmarks[12], w, h)
    shoulder_cm = round(shoulder_px * scale, 1)

    shoulder_y = int(((landmarks[11].y + landmarks[12].y) / 2) * h)
    hip_y = int(((landmarks[23].y + landmarks[24].y) / 2) * h)
    waist_result = find_waist_hybrid(detection_result, landmarks, image.numpy_view().shape, shoulder_y, hip_y)

    heights = {
        "chest": (landmarks[11].y + landmarks[12].y) / 2 + 0.05,
        "waist": waist_result["waist_y_normalized"],
        "hip": (landmarks[23].y + landmarks[24].y) / 2,
        "thigh": (landmarks[23].y + landmarks[25].y) / 2 + 0.03,
    }

    measurements = {"shoulder": shoulder_cm, "height_cm": real_height_cm}
    for name, y_norm in heights.items():
        width_px = measure_width_at_height(detection_result, y_norm, image.numpy_view().shape)
        measurements[name] = round(width_px * scale, 1) if width_px else None

    body_shape = classify_body_shape(measurements)
    recommended_size = map_to_size(measurements)

    annotated = draw_measurement_overlay(
        image.numpy_view(), detection_result, measurements, shoulder_y, waist_result["waist_y_normalized"], hip_y
    )
    annotated_bgr = cv2.cvtColor(annotated, cv2.COLOR_RGB2BGR)
    success, buffer = cv2.imencode(".jpg", annotated_bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])
    annotated_image_base64 = base64.b64encode(buffer).decode("utf-8") if success else None

    return {
        "measurements": measurements,
        "body_shape": body_shape,
        "recommended_size": recommended_size,
        "waist_confidence": waist_result.get("confidence", "unknown"),
        "waist_method": waist_result.get("method", "unknown"),
        "annotated_image_base64": annotated_image_base64,
        # Normalized (0-1) vertical positions so the frontend can draw its OWN
        # live lines/labels over the plain photo instead of a static baked
        # image -- these move with the real detection, and the label text can
        # read from live (possibly manually-edited) state instead.
        "line_positions": {
            "shoulder": shoulder_y / h,
            "waist": waist_result["waist_y_normalized"],
            "hip": hip_y / h,
        },
    }


# --- HTTP service ---
app = Flask(__name__)
CORS(app)


@app.route("/detect-size", methods=["POST"])
def handle_detect_size():
    body = request.get_json(force=True)
    image_base64 = body.get("imageBase64", "")
    height_cm = body.get("heightCm", 165)

    if ";base64," in image_base64:
        image_base64 = image_base64.split(";base64,")[1]

    if not image_base64:
        return jsonify({"error": "imageBase64 is required"}), 400

    tmp_path = None
    try:
        image_bytes = base64.b64decode(image_base64)
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        result = detect_size(tmp_path, float(height_cm))
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 422
    except Exception as e:
        print("detect_size failed:", e)
        return jsonify({"error": "Measurement detection failed", "detail": str(e)}), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001)
