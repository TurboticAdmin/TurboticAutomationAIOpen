import { extractTextFromHtml } from "@/lib/game";
import { NextRequest } from "next/server";
import fs from 'fs';
import path from 'path';
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
    const { html } = await req.json();

    const outHtml = await extractTextFromHtml(html);
    await getDb().collection('brat_extract_text').insertOne({ html, outHtml });

    return new Response(outHtml, {
        headers: {
            'Content-Type': 'text/html'
        }
    });
}
