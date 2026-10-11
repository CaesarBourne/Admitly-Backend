import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/** Thin wrapper over a private Supabase Storage bucket. Every uploaded file
 *  is served back through short-lived signed URLs — never made public. */
@Injectable()
export class StorageService {
  private readonly client: SupabaseClient | null;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('supabase.url');
    const key = this.config.get<string>('supabase.serviceRoleKey');
    this.bucket = this.config.get<string>('supabase.storageBucket')!;
    this.client = url && key ? createClient(url, key) : null;
  }

  private requireClient(): SupabaseClient {
    if (!this.client) {
      throw new Error(
        'Supabase Storage is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
    return this.client;
  }

  async upload(objectPath: string, buffer: Buffer, contentType: string): Promise<void> {
    const client = this.requireClient();
    const { error } = await client.storage
      .from(this.bucket)
      .upload(objectPath, buffer, { contentType, upsert: true });
    if (error) throw error;
  }

  async getSignedUrl(objectPath: string, expiresInSeconds = 300): Promise<string> {
    const client = this.requireClient();
    const { data, error } = await client.storage
      .from(this.bucket)
      .createSignedUrl(objectPath, expiresInSeconds);
    if (error || !data) throw error ?? new Error('Could not create a signed URL.');
    return data.signedUrl;
  }

  async delete(objectPath: string): Promise<void> {
    const client = this.requireClient();
    await client.storage.from(this.bucket).remove([objectPath]);
  }
}
