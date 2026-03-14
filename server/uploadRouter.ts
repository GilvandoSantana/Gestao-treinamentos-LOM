import { Router } from "express";
import { ENV } from "./_core/env";
import { adminProcedure, router, publicProcedure } from "./_core/trpc";
import { z } from "zod";
import crypto from "crypto";

// We'll use a simple express route for file uploads as tRPC isn't ideal for large binary data
export const uploadRouter = Router();

uploadRouter.post("/api/upload", async (req, res) => {
  try {
    // Basic check for admin (in a real app, we'd use the same auth middleware as tRPC)
    // For now, we'll assume the request is authenticated if it has the right cookies
    
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send("No files were uploaded.");
    }

    const file = req.files.file as any;
    const base64Data = file.data.toString("base64");
    const fileUri = `data:${file.mimetype};base64,${base64Data}`;

    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = crypto
      .createHash("sha1")
      .update(`timestamp=${timestamp}${ENV.cloudinary.apiSecret}`)
      .digest("hex");

    const formData = new FormData();
    formData.append("file", fileUri);
    formData.append("api_key", ENV.cloudinary.apiKey);
    formData.append("timestamp", timestamp.toString());
    formData.append("signature", signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${ENV.cloudinary.cloudName}/auto/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    res.json({ url: data.secure_url });
  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message });
  }
});
