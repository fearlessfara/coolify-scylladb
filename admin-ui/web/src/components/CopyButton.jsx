import { useState } from "react";
import { copyText } from "../utils.js";

export default function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button type="button" className="btn-sm secondary" onClick={handleCopy}>
      {copied ? "Copied" : label}
    </button>
  );
}
