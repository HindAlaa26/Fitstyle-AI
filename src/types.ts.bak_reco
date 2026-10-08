export type CategoryType = "top" | "bottom" | "footwear" | "accessories";
export type OccasionType = "Wedding" | "Casual" | "Formal" | "Party" | "Interview";
export type BodyShapeType = "Hourglass" | "Pear" | "Apple" | "Rectangle" | "Inverted Triangle";

export interface Product {
  id: string;
  name: string;
  category: CategoryType;
  colour: string;
  occasion: OccasionType;
  size: string;
  price: number;
  image: string;
  occasions?: string[];
  shapes?: string[];
  inStock?: boolean;
  quantity?: number;
  season?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  role: "shopper" | "owner";
  emailVerified?: boolean;
  preferredPayment?: "google" | "apple" | null;
  wishlist?: string[];
}

export interface BodyKeypoint {
  id: string;
  name: string;
  label: string;
  x: number; // Percent 0-100 of container width
  y: number; // Percent 0-100 of container height
  side: "left" | "right" | "center";
}

export interface SizingRecommendation {
  recommendedSize: string;
  description: string;
  numericSize: string;
}

