import { NextResponse } from "next/server";
import { EdgeTTS } from "node-edge-tts";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const runtime = "nodejs";
export const maxDuration = 30;

const VOICES = new Set([
  "zh-CN-XiaoxiaoNeural",
  "zh-CN-XiaoyiNeural",
  "zh-CN-YunjianNeural",
  "zh-CN-YunxiNeural",
]);

export async function POST(request: Request) {
  let tempDir: string | undefined;
  try {
    const body = (await request.json()) as { text?: unknown; voice?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const voice = typeof body.voice === "string" && VOICES.has(body.voice)
      ? body.voice
      : "zh-CN-XiaoxiaoNeural";

    if (!text || text.length > 800) {
      return NextResponse.json(
        { error: "Text must contain between 1 and 800 characters." },
        { status: 400 },
      );
    }

    tempDir = await mkdtemp(join(tmpdir(), "honghong-tts-"));
    const audioPath = join(tempDir, "speech.mp3");
    const tts = new EdgeTTS({
      voice,
      lang: "zh-CN",
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      timeout: 20000,
      rate: "+0%",
      pitch: "+0Hz",
    });

    await tts.ttsPromise(text, audioPath);
    const audio = await readFile(audioPath);

    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Edge TTS synthesis failed:", error);
    return NextResponse.json(
      { error: "语音生成暂时不可用，请稍后重试。" },
      { status: 502 },
    );
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
