import { findSelectors } from "@/lib/game";
import { NextRequest } from "next/server";
import fs from 'fs';
import path from 'path';
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
    const { html, promptToFindSelectors } = await req.json();

    const selectors = await findSelectors(html, promptToFindSelectors);

    await getDb().collection('brat_find_selectors').insertOne({ html, promptToFindSelectors, selectors });

    return new Response(JSON.stringify({
        selectors
    }), {
        headers: {
            'Content-Type': 'application/json'
        }
    });
}
