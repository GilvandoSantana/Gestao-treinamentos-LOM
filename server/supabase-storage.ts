import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase credentials not configured. Certificate uploads will not work."
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BUCKET_NAME = "certificates";

export interface UploadResult {
  path: string;
  url: string;
  fileName: string;
  size: number;
}

export async function uploadCertificateToSupabase(
  file: Buffer | Uint8Array,
  fileName: string,
  mimeType: string = "application/octet-stream"
): Promise<UploadResult> {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase is not configured");
    }

    // Generate a unique file path
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}-${fileName}`;
    const filePath = `certificates/${uniqueFileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Supabase upload error: ${error.message}`);
    }

    if (!data) {
      throw new Error("No data returned from Supabase upload");
    }

    // Get the public URL
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return {
      path: filePath,
      url: publicUrlData.publicUrl,
      fileName: uniqueFileName,
      size: file.length,
    };
  } catch (error) {
    console.error("Error uploading certificate to Supabase:", error);
    throw error;
  }
}

export async function deleteCertificateFromSupabase(
  filePath: string
): Promise<boolean> {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase is not configured");
    }

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      throw new Error(`Supabase delete error: ${error.message}`);
    }

    return true;
  } catch (error) {
    console.error("Error deleting certificate from Supabase:", error);
    throw error;
  }
}

export async function getCertificateUrl(filePath: string): Promise<string> {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase is not configured");
    }

    const { data } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error) {
    console.error("Error getting certificate URL from Supabase:", error);
    throw error;
  }
}
