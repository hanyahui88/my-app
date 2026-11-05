import { NextResponse } from "next/server";
import { LLMClient } from "coze-coding-dev-sdk";

export const maxDuration = 35;

type ChatMessage = { role: "user" | "partner"; content: string };
type ChatRequest = {
  gender: "female" | "male";
  scenario: string;
  messages: ChatMessage[];
  affection: number;
  step: number;
  isGameOver: boolean;
  won: boolean;
};

const fallbackOptions = [
  { id: "1", content: "我知道这次是我做得不好，我会认真弥补，不只是嘴上说说。", score: 18 },
  { id: "2", content: "我想听听你最在意的是什么，我先不辩解，好好听你说。", score: 15 },
  { id: "3", content: "你能不能别生气了？这点小事至于吗？", score: -18 },
  { id: "4", content: "我现在去给你写一份八百字检讨，附目录和参考文献。", score: -8 },
  { id: "5", content: "要不我把自己打包寄给你，运费到付，情绪价值包邮。", score: -12 },
  { id: "6", content: "我宣布从今天起，家里的遥控器和最后一块肉都归你。", score: -6 },
];

function fallbackReply(input: ChatRequest) {
  const partner = input.gender === "female" ? "她" : "他";
  if (input.isGameOver) {
    return input.won
      ? { partnerMessage: "好啦……我原谅你了。但你要记得今天说的话，下次一定要用行动证明哦。（偷偷牵住你的手）", options: [] }
      : { partnerMessage: "我现在还是很难过，需要一点时间冷静。希望你能认真记住这次的感受。（转过身去）", options: [] };
  }
  const opening = input.step === 1
    ? `（${partner}抱着手臂，眼眶有点红）${input.scenario} 你现在还有什么想说的吗？`
    : input.affection < 0
      ? "（语气冷下来）你还是没明白我为什么难过吗？我不想再听敷衍的话了。"
      : input.affection < 30
        ? "（仍然有些委屈）我在听，但你最好认真一点。这件事对我真的很重要。"
        : input.affection < 60
          ? "（语气稍微软了一点）哼……你说的我记住了。不过光说好听的可不够。"
          : "（别开脸，小声嘟囔）其实我已经没那么生气了……但你还得给我一个保证。";
  return { partnerMessage: opening, options: [...fallbackOptions].sort(() => Math.random() - 0.5) };
}

function parseJson(content: string) {
  const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as ChatRequest;
    if (!input.gender || !input.scenario || !Array.isArray(input.messages) || input.step < 1 || input.step > 10) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const fallback = fallbackReply(input);
    if (!process.env.COZE_API_TOKEN && !process.env.COZE_WORKLOAD_IDENTITY_API_KEY) {
      return NextResponse.json({ ...fallback, mode: "fallback" });
    }
    try {
      const client = new LLMClient();
      const history = input.messages.map((message) => ({
        role: message.role === "partner" ? "assistant" as const : "user" as const,
        content: message.content,
      }));
      const system = [
        "你正在扮演用户的恋爱对象。用自然、情绪细腻的中文连续对话，不要跳出角色。",
        `对方性别：${input.gender === "female" ? "女" : "男"}；矛盾场景：${input.scenario}。`,
        `当前好感度：${input.affection}（-50至100），轮次：${input.step}/10。`,
        "情绪规则：-50~0非常生气；0~30仍生气但愿意听；30~60开始软化；60~80快被哄好；80以上原谅但要求保证。",
        "每轮必须给出6个选项：2个真诚、具体的加分选项（score 5至20）；4个减分选项（score -5至-30），其中至少2个离谱搞笑。不要透露选项分数或好坏。选项不可重复，顺序随机。",
        "严格输出 JSON，不要 Markdown：{\"partnerMessage\":\"...\",\"options\":[{\"id\":\"1\",\"content\":\"...\",\"score\":10}]}。",
        input.isGameOver ? `游戏结束，胜负：${input.won ? "成功" : "失败"}。生成一段符合结果的结束对话，options返回空数组。` : "生成下一轮回应和6个选项。",
      ].join("\n");
      const response = await Promise.race([
        client.invoke([{ role: "system", content: system }, ...history], { temperature: 0.9 }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("LLM timeout")), 30000)),
      ]);
      const parsed = parseJson(String(response.content));
      const options = Array.isArray(parsed.options) ? parsed.options.slice(0, 6).map((item: { id?: string; content?: string; score?: number }, index: number) => ({
        id: String(item.id ?? index + 1),
        content: String(item.content ?? ""),
        score: Math.max(-30, Math.min(20, Number(item.score ?? 0))),
      })).filter((item: { content: string }) => item.content) : fallback.options;
      return NextResponse.json({
        partnerMessage: String(parsed.partnerMessage ?? fallback.partnerMessage),
        options: input.isGameOver ? [] : options.length === 6 ? options : fallback.options,
        mode: "ai",
      });
    } catch (error) {
      console.error("Coze chat generation failed; using fallback:", error);
      return NextResponse.json({ ...fallback, mode: "fallback" });
    }
  } catch (error) {
    console.error("Chat API request failed:", error);
    return NextResponse.json({ error: "Unable to generate chat" }, { status: 500 });
  }
}
