"use client";

import JSZip from "jszip";
import axios from "axios";
import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BACKEND_URL, CLOUDFLARE_URL } from "@/app/config";
import { cn } from "@/lib/utils";

export function UploadModal({ onUploadDone }: { onUploadDone: (zipUrl: string) => void }) {
  const handleUpload = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;

    input.onchange = async () => {
      if (!input.files || input.files.length === 0) return;

      try {
        const zip = new JSZip();
        for (const file of input.files) {
          const content = await file.arrayBuffer();
          zip.file(file.name, content);
        }

        const content = await zip.generateAsync({ type: "blob" });

        const res = await axios.get(`${BACKEND_URL}/pre-signed-url`);
        const url = res.data.url;
        const key = res.data.key;

        await axios.put(url, content, {
          headers: {
            "Content-Type": "application/zip",
          },
        });

        onUploadDone(`${CLOUDFLARE_URL}/${key}`);
      } catch (err) {
        console.error("Upload failed", err);
        alert("Upload failed. Please try again.");
      }
    };

    input.click();
  };

  return (
    <Card className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
      <CloudUploadIcon className="w-16 h-16 text-zinc-500 dark:text-zinc-400 mb-4" />
      <Button variant="outline" className="w-full" onClick={handleUpload}>
        Select File
      </Button>
    </Card>
  );
}

function CloudUploadIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2" />
      <path d="M12 12v9" />
      <path d="m16 16-4-4-4 4" />
    </svg>
  );
}
