#!/usr/bin/env node
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline";

const password = process.argv[2];

async function fromPrompt() {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question("Password: ", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const plain = password ?? (await fromPrompt());
if (!plain) {
  console.error("Usage: npm run hash-password -- <password>");
  process.exit(1);
}

const hash = await bcrypt.hash(plain, 12);
console.log(hash);
