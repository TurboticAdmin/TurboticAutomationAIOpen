import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import authenticationBackend from "../../../authentication/authentication-backend";
import { Buffer } from 'buffer';

function isValidObjectId(id: string) {
  return typeof id === 'string' && id.length === 24 && /^[a-fA-F0-9]+$/.test(id);
}

function encodeKey(key: string) {
  return Buffer.from(key, 'utf-8').toString('base64');
}
function decodeKey(encoded: string) {
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidObjectId(id)) {
    return new Response(JSON.stringify({ error: 'Invalid automationId' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400
    });
  }
  const currentUser = await authenticationBackend.getCurrentUser(req);
  if (!currentUser) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 401
    });
  }
  const db = getDb();
  const automation = await db.collection('automations').findOne({ _id: ObjectId.createFromHexString(id) });
  if (!automation) {
    return new Response(JSON.stringify({ error: 'Automation not found' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 404
    });
  }
  const isAdmin = Array.isArray(automation.adminUserIds) && automation.adminUserIds.includes(String(currentUser._id));
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Only admins can regenerate the API key' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 403
    });
  }
  const newApiKey = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const encodedKey = encodeKey(newApiKey);
  await db.collection('automations').updateOne(
    { _id: ObjectId.createFromHexString(id) },
    { $set: { apiKey: encodedKey } }
  );
  return new Response(JSON.stringify({ apiKey: newApiKey }), {
    headers: { 'Content-Type': 'application/json' }
  });
} 