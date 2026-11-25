import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';

/** Uploads a local file to a private bucket under the user's own folder and returns the object path. */
export async function uploadPrivateFile(bucket: 'therapist-credentials' | 'medical-documents' | 'therapist-photos', userId: string, file: { uri: string; name: string; mimeType?: string }, subfolder?: string): Promise<string> {
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const path = [userId, subfolder, `${Date.now()}-${safe}`].filter(Boolean).join('/');
  let body: ArrayBuffer | Blob;
  if (Platform.OS === 'web') {
    body = await (await fetch(file.uri)).blob();
  } else {
    const b64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    body = bytes.buffer;
  }
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: file.mimeType ?? 'application/octet-stream', upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
