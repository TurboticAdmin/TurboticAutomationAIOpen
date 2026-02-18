import { reviewCode } from "@/lib/game";
import { NextRequest } from "next/server";

// const code = `
// const express = require('express')
// const app = express()
// const port = 3000

// app.get('/', (req, res) => {
//   res.send('Hello World!')
// })

// app.listen(port, () => {
//   console.log(\`Example app listening on port $\{port\}\`)
// })

// let tick = 0;
// setInterval(() => {
//   // console.log('Tick ', tick++);
// }, 1000);

// `
// const summaryOfRequirement = 'The code should be a simple express server that listens on port 3000 and sends a "Hello World!" response to the root URL.';


const code = `
console.log('Hello World!');

`
const summaryOfRequirement = 'The code should print "Hello World!" to the console.';


export async function POST(req: NextRequest) {
    const result = await reviewCode(code, summaryOfRequirement);

    return new Response(JSON.stringify(result), {
        headers: {
            'Content-Type': 'application/json'
        }
    });
}
