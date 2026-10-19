<div align="center">

# FitStyle AI

### AI-Powered Fashion Fitting Platform with Cloud Computing

One photograph. A size that fits. Outfits that match. A look you can preview before you buy.

<p>
  <img alt="React" src="https://img.shields.io/badge/React-19-20232A?logo=react&logoColor=61DAFB">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-Express-339933?logo=nodedotjs&logoColor=white">
  <img alt="Python" src="https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white">
  <img alt="MediaPipe" src="https://img.shields.io/badge/MediaPipe-Pose-0097A7">
  <img alt="AWS" src="https://img.shields.io/badge/AWS-Cognito_%7C_DynamoDB-FF9900?logo=amazonaws&logoColor=white">
  <img alt="Terraform" src="https://img.shields.io/badge/Terraform-7B42BC?logo=terraform&logoColor=white">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white">
</p>

<p>
  <a href="#overview">Overview</a> ·
  <a href="#features">Features</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#architecture-and-technology">Architecture</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#api-overview">API</a> ·
  <a href="#known-limitations">Limitations</a> ·
  <a href="#team">Team</a>
</p>

<img src="docs/screenshots/brtual_try_on_before_click_generate_look.PNG" alt="FitStyle AI: recommended outfit, virtual try-on preview and the shopper's selection" width="900">

</div>

---

## Overview

FitStyle AI is an AI-powered web platform that addresses two problems of online fashion shopping: **uncertainty about size** and **the difficulty of composing complete, occasion-appropriate outfits**.

From one full-body photograph and the shopper's height, the system estimates body measurements, body shape and a size (MediaPipe Pose and segmentation). A recommendation engine built on Marqo-FashionCLIP embeddings and a learned pairwise compatibility model proposes five complete outfits for the shopper's size, body shape and occasion, using only items in stock in the shopper's size, with an LLM-generated explanation (Groq). Selected garments can be previewed on the shopper with LaDI-VTON.

The platform includes a **shopper portal** (cart, sandbox checkout, PDF/QR order summary for in-store payment) and a **store-owner portal** (inventory management and sales analytics).

> The web application runs locally. The cloud is used for identity and data: **Amazon Cognito** (authentication), **Amazon DynamoDB** (catalogue, users, carts, measurements, orders) and **Supabase Storage** (images). The AWS resources are defined with **Terraform** and stay within free tiers.

---

## Features

| Area | What it does |
|---|---|
| **Body analysis** | Estimates shoulder, chest, waist, hip and thigh widths from one front-facing photograph and the stated height; classifies the body shape (pear, hourglass, apple, rectangle, inverted triangle) and suggests a size. Every value can be edited. |
| **Outfit recommendation** | Five complete outfits per profile (size, body shape, occasion, season) with a match score and total price; pieces grouped by category (dress, top, bottom, outerwear, shoes, accessories). |
| **Always in stock, always in your size** | Recommendations are joined with the live catalogue at request time; out-of-stock pieces and sizes the shop no longer holds are removed. |
| **Swap and customise** | Tap any piece to open all matching products of that category in the shopper's size, replace it, or deselect it. |
| **Explanations** | A "Why this outfit" card explains the selection and is regenerated whenever the selection changes. |
| **Virtual try-on** | Previews the selected garments on the shopper's own photograph (**Generate Look**). |
| **Shopping flow** | Cart with quantities and promo-code field, order creation with PDF export, sandbox payment, order confirmation with delivery tracking. |
| **Pay in store** | The order is reserved and a PDF summary with a QR code and the shop location is generated for payment at pickup. |
| **Store-owner portal** | Inventory dashboard (search, filters, stock switch, edit, delete, add garment, CSV export) and a sales and analytics dashboard. |
| **Authentication** | E-mail and password or Google sign-in through Amazon Cognito; separate shopper and store-owner access; store-owner accounts by invitation only. |

---

## Screenshots

### Access

<table>
  <tr>
    <td colspan="2"><img src="docs/screenshots/home_screen.PNG" alt="Landing page"><br><sub><b>Landing page</b></sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/sign_in_as_shopper.PNG" alt="Sign in as a shopper"><br><sub><b>Sign in</b> as a shopper (e-mail and password or Google)</sub></td>
    <td width="50%"><img src="docs/screenshots/sigin_as_admin.PNG" alt="Sign in as a store owner"><br><sub><b>Sign in</b> as a store owner</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/sign_up_as_shopper.PNG" alt="Sign up as a shopper"><br><sub><b>Sign up</b> as a shopper</sub></td>
    <td width="50%"><img src="docs/screenshots/sign_up_as_admin.PNG" alt="Store-owner sign-up is by invitation only"><br><sub><b>Sign up</b> as a store owner (by invitation only)</sub></td>
  </tr>
</table>

### Shopper journey

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/upload_image_and_select_occasion.PNG" alt="Upload a photograph and choose an occasion"><br><sub><b>Step 1.</b> Upload a photograph and choose an occasion</sub></td>
    <td width="50%"><img src="docs/screenshots/body_measurment_page.PNG" alt="Confirm your measurements"><br><sub><b>Step 2.</b> Review the measurements, body shape and size; edit them if needed</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/brtual_try_on_before_click_generate_look.PNG" alt="Virtual try-on step before generating the look"><br><sub><b>Step 3.</b> Recommended outfit, explanation card and selection, before <b>Generate Look</b></sub></td>
    <td width="50%"><img src="docs/screenshots/select_another_top.PNG" alt="Dialog with all matching tops"><br><sub><b>Swap a piece.</b> All matching products of the category in the shopper's size</sub></td>
  </tr>
</table>

<table>
  <tr>
    <td width="33%" align="center"><img src="docs/screenshots/recommendation_outfit.PNG" alt="Recommended outfit"><br><sub>(a) the recommended outfit</sub></td>
    <td width="33%" align="center"><img src="docs/screenshots/five_recommended_outft.PNG" alt="All five recommended outfits"><br><sub>(b) all five outfits</sub></td>
    <td width="33%" align="center"><img src="docs/screenshots/user_selection_and_add_to_cart.PNG" alt="The shopper's selection"><br><sub>(c) the shopper's selection</sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/llm_explaination.PNG" alt="Why this outfit explanation card" width="420"><br>
  <sub><b>"Why this outfit"</b>: an LLM explanation built only from structured evidence about the outfit</sub>
</p>

### Checkout

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/cart_page.PNG" alt="Shopping cart"><br><sub><b>Cart.</b> Buy online or pay offline</sub></td>
    <td width="50%"><img src="docs/screenshots/choose_pay_online_or_offline.PNG" alt="Create order"><br><sub><b>Step 4.</b> Create the order and export a PDF summary</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/add_credi_info.PNG" alt="Sandbox payment gateway"><br><sub><b>Step 5.</b> Sandbox payment (no real currency is debited)</sub></td>
    <td width="50%"><img src="docs/screenshots/order_done.PNG" alt="Order confirmation with delivery tracking"><br><sub><b>Step 6.</b> Order confirmation and delivery tracking</sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/pay_offline_pdf.PNG" alt="PDF order summary with QR code" width="320"><br>
  <sub><b>Pay in store.</b> PDF order summary with a QR code and the shop location</sub>
</p>

### Store-owner portal

<table>
  <tr>
    <td width="70%"><img src="docs/screenshots/admin_dashboard.PNG" alt="Inventory dashboard"><br><sub><b>Inventory.</b> Catalogue summary, search, filters, stock switch, edit and delete, add garment, CSV export</sub></td>
    <td width="30%"><img src="docs/screenshots/admin_analytics_board.PNG" alt="Sales and analytics dashboard"><br><sub><b>Sales and analytics</b></sub></td>
  </tr>
</table>

---

## How it works

<p align="center">
  <img src="docs/diagrams/user-journey.png" alt="End-to-end flow of a shopper through FitStyle AI" width="820">
</p>

### 1. Body measurement and size (MediaPipe Pose and segmentation)

The measurement service (`body_measurement_service.py`) detects 33 pose landmarks and a person mask with the MediaPipe Pose Landmarker. The scale is the stated height divided by the pixel distance from the nose to the left ankle. The shoulder width comes from the shoulder landmarks; chest, hip and thigh widths are read from the silhouette mask; the waist is the narrowest row of the torso, accepted only if it lies between 35% and 65% of the torso height, otherwise a proportional estimate is used and the result is flagged as low confidence. Body shape is assigned by five rules and the size by a shoulder-width chart.

### 2. Outfit recommendation (Marqo-FashionCLIP and a learned compatibility model)

For a profile (size, body shape, occasion, season) the engine filters the catalogue by size, season and usage, scores each product for style, body shape and occasion with Marqo-FashionCLIP embeddings, scores pairs of garments with a learned compatibility model, and assembles outfits with a beam search that applies a compatibility floor and a per-item reuse cap for diversity. Because the neural pipeline needs a GPU, it runs **offline** once for every combination of 4 sizes, 5 body shapes, 5 occasions and 4 seasons (400 profiles) and writes `data/recommendation_index.json`. At request time the server joins the stored outfits with the live catalogue in DynamoDB, so price, stock and sizes are always current.

### 3. Virtual try-on (LaDI-VTON)

The try-on service runs LaDI-VTON, a latent-diffusion model, on a free GPU notebook (Google Colab) and is reached through a public tunnel protected by an API key. The Express server forwards the shopper's photograph and the garment images, polls the job and returns the result image. Garments are cleaned (garment pixels only, white background), the person is prepared (pose keypoints and a body-part map), and the identity (face, hair, accessories, shoes) is restored after generation.

---

## Architecture and technology

<p align="center">
  <img src="docs/diagrams/architecture.png" alt="System architecture: local components and cloud services" width="760">
</p>

| Layer | Technology |
|---|---|
| Front end | React, Vite, TypeScript, Tailwind CSS, Recharts, jsPDF, QR codes |
| Back end | Node.js, Express (TypeScript, run with `tsx`) |
| Authentication | Amazon Cognito (e-mail and password, Google through the Hosted UI), JWT verification on the server |
| Data | Amazon DynamoDB (Users, Products, Orders, Measurements) |
| Images | Supabase Storage |
| Infrastructure as code | Terraform (DynamoDB tables, Cognito, IAM user, budget alert) |
| Body measurement | Python, Flask, MediaPipe Pose Landmarker, OpenCV, NumPy |
| Recommendation | Python notebook, Marqo-FashionCLIP, learned pairwise compatibility model, beam search |
| Explanations | Groq (large language model), with a template fallback |
| Virtual try-on | LaDI-VTON on a free GPU notebook, served with FastAPI |

---

## Repository structure

```
.
├── server.ts                      # Express server and REST API
├── recommendationService.ts       # Serves the pre-computed outfits and joins them with the live catalogue
├── body_measurement_service.py    # Flask service: pose landmarks, widths, body shape, size
├── pose_landmarker.task           # MediaPipe Pose Landmarker model
├── export_catalog_for_migration.py / migrate_catalog_to_dynamodb.py   # One-time catalogue migration
├── FitVerse_Detect_Size_Module_FIXED.ipynb   # Notebook behind the measurement module
├── data/
│   ├── products.json              # Catalogue seed
│   └── recommendation_index.json  # Pre-computed outfits (generated by the recommendation notebook)
├── infra/                         # Terraform: DynamoDB, Cognito, IAM, budget alert
├── src/
│   ├── App.tsx, main.tsx, types.ts
│   ├── components/                # ShopperStudioView, OutfitRecommendationPanel, OutfitWhyCard,
│   │                              # ProductCartPage, CheckoutDialog, AdminDashboard,
│   │                              # SalesAnalyticsDashboard, LoginView, LandingPage, ...
│   └── utils/                     # authFetch, recommendationsApi, bodyShapeMap, orderPdf, poseDetection
├── docs/                          # Guides, screenshots and diagrams used in this README
└── scripts/                       # Helper scripts
```

---

## Getting started

### Prerequisites

- Node.js 20 or newer and npm
- Python 3.10 or newer (measurement service)
- Terraform 1.5 or newer and an AWS account (free tier is enough)
- A Supabase project, a Groq API key and, for Google sign-in, a Google OAuth client
- A Google account for the Colab notebooks (recommendation index and virtual try-on)

### 1. Install

```bash
git clone <repository-url>
cd <repository-folder>
npm install
```

### 2. Provision the AWS resources

```bash
cd infra
# create terraform.tfvars with at least: budget_alert_email = "you@example.com"
# optional: cognito_domain_prefix (must be globally unique), Google OAuth client values (see variables.tf)
terraform init
terraform apply
terraform output          # Cognito IDs, Cognito domain, region and the backend access keys for .env
```

Terraform creates the four DynamoDB tables, the Cognito user pool, web client and hosted domain, an IAM user for the server and a budget alert that warns at the first charge. Do not commit `terraform.tfvars` or the state file.

### 3. Configure the environment

Create a `.env` file in the project root (it is git-ignored):

```dotenv
# AWS (values come from `terraform output`)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
COGNITO_USER_POOL_ID=...
COGNITO_CLIENT_ID=...
DYNAMODB_USERS_TABLE=fitstyle-ai-Users
DYNAMODB_PRODUCTS_TABLE=fitstyle-ai-Products
DYNAMODB_ORDERS_TABLE=fitstyle-ai-Orders
DYNAMODB_MEASUREMENTS_TABLE=fitstyle-ai-Measurements

# Front end (Cognito Hosted UI)
VITE_COGNITO_USER_POOL_ID=...
VITE_COGNITO_CLIENT_ID=...
VITE_COGNITO_DOMAIN=...

# Store owners: e-mail addresses that receive the store-owner role (comma separated)
ADMIN_EMAILS=owner@example.com

# Images
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Explanations
GROQ_API_KEY=...

# Virtual try-on service: the public URL printed by the try-on notebook and its API key.
# Use the variable names read in server.ts.
```

### 4. Load the catalogue (one time)

```bash
python export_catalog_for_migration.py     # writes catalog_export.json
python migrate_catalog_to_dynamodb.py      # loads the products into the Products table
```

### 5. Start the body-measurement service

```bash
pip install flask flask-cors mediapipe opencv-python numpy
python body_measurement_service.py         # listens on http://localhost:5001
```

### 6. Add the recommendation index

Run the recommendation notebook on Colab with a T4 GPU, upload `catalog_export.json` and your `.env` when asked, and place the downloaded `recommendation_index.json` in `data/`. Without this file the shopper still sees the earlier collection list, so the application keeps working.

### 7. Start the virtual try-on service (needed for Generate Look)

Run the try-on notebook on a Colab GPU. It prints a public URL and uses an API key; add both to `.env`. The URL changes whenever the notebook is restarted.

### 8. Run the application

```bash
npm run dev                                # http://localhost:3001
```

The terminal should print `[DynamoDB] Loaded ... products into memory` and `[Reco] Loaded 400 profiles from recommendation_index.json`.

For a production build: `npm run build` and then `npm run start`.

### Accounts and test data

- **Shopper:** sign up from the sign-in page (e-mail and password or Google).
- **Store owner:** create the account in Cognito (`aws cognito-idp admin-create-user ...`) and add the e-mail to `ADMIN_EMAILS`; store-owner sign-up is not public.
- **Sandbox payment:** use the test card `4242 4242 4242 4242`. No real currency is debited.

---

## API overview

All routes are under `/api`.

| Group | Routes |
|---|---|
| Health | `GET /health` |
| Products | `GET`, `POST /products`; `PUT`, `DELETE /products/:id`; `POST /products/:id/decrement-stock`; `POST /upload-image` |
| Users | `GET /users`; `GET`, `PUT`, `DELETE /users/:id` |
| Body analysis | `POST /analyze-body`; `GET`, `PUT /measurements/:userId` |
| Recommendations | `GET /recommendations`; `GET /recommendations/alternatives`; `POST /recommendations/explain`; `POST /style-advice` |
| Virtual try-on | `POST /try-on` |
| Cart and orders | `GET`, `PUT`, `DELETE /cart/:userId`; `POST /checkout`; `GET /orders/user/:userId`; `PUT /orders/:orderId`; `GET /analytics/orders` |

---

## Known limitations

- **Placeholder shop data.** Sizes and prices of the catalogue were generated for the project; sizes are S to XL only (an XS shopper is shown size S).
- **Measurements are silhouette widths from the front, not circumferences.** They were examined on a few test photographs and have not been validated against tape measurements; the size chart is a placeholder.
- **Recommendations are pre-computed** for 400 profiles. Products added later are not ranked until the index is regenerated, and finer measurements do not change the result beyond body shape and size.
- **Compatibility labels are proxies** derived from catalogue attributes, not human preferences; no user study has been carried out.
- **The try-on service depends on a free GPU notebook.** It must be running, its public URL changes on restart, and generating a look takes time.
- **Payment is simulated.**

---

## Team

Graduation project, M.S. in Computer Science, Queen's University. Supervisor: **Dr. Anwar Hossain**.

| Name | ID |
|---|---|
| Afnan Mohamed Ali Dior | 20596319 |
| Alaa Ehab Mohamed El Shenawy | 20596313 |
| Hind Alaa Fathy Abdelhalim Ahmed | 20596337 |
| Manar Samir Mohamed Elabsi | 20596305 |

We thank the Ministry of Communications and Information Technology, the Military Academy, Capgemini (Eng. Farida) and the Digilians programme for their support.

---

## Credits

- [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) for pose landmarks and segmentation.
- [Marqo-FashionCLIP](https://huggingface.co/Marqo/marqo-fashionCLIP) for fashion image and text embeddings.
- [LaDI-VTON](https://github.com/miccunifi/ladi-vton): Morelli et al., *LaDI-VTON: Latent Diffusion Textual-Inversion Enhanced Virtual Try-On*, ACM Multimedia 2023, and the [Dress Code](https://doi.org/10.1007/978-3-031-20074-8_20) dataset (ECCV 2022).
- Catalogue images and attributes from the Hugging Face dataset [ashraq/fashion-product-images-small](https://huggingface.co/datasets/ashraq/fashion-product-images-small).
- Groq for the language-model API.

This is an academic project. Third-party models and datasets keep their own licences.
