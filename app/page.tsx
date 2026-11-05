"use client";

import { useCallback, useMemo, useRef, useState } from "react";

type Gender = "female" | "male";
type VoiceType = "gentle-female" | "cool-female" | "cute-female" | "deep-male" | "gentle-male";
type Scenario = { id: string; title: string; description: string };
type Message = { role: "user" | "partner"; content: string; id: string };
type Option = { id: string; content: string; score: number };
type Screen = "start" | "game" | "result";

const SCENARIOS: Scenario[] = [
  { id: "anniversary", title: "忘记纪念日", description: "今天是你们在一起三周年，你却完全忘了这件事……" },
  { id: "late-night", title: "深夜不回消息", description: "你昨晚打游戏到凌晨三点，对方发了十几条消息你都没回……" },
  { id: "flirty-chat", title: "被发现和异性聊天", description: "对方看到了你和异性朋友有些暧昧的聊天记录……" },
  { id: "lost-cat", title: "把对方的猫弄丢了", description: "你帮对方照顾猫的时候，猫咪趁你不注意跑丢了……" },
  { id: "public-joke", title: "当众让对方没面子", description: "你在朋友聚会上开了一个过分的玩笑，让对方很难堪……" },
];

const VOICES: { id: VoiceType; label: string; gender: Gender; speaker: string }[] = [
  { id: "gentle-female", label: "温柔女声", gender: "female", speaker: "zh_female_xiaohe_uranus_bigtts" },
  { id: "cool-female", label: "霸道御姐", gender: "female", speaker: "zh_female_vv_uranus_bigtts" },
  { id: "cute-female", label: "可爱软妹", gender: "female", speaker: "saturn_zh_female_keainvsheng_tob" },
  { id: "deep-male", label: "低沉男声", gender: "male", speaker: "zh_male_m191_uranus_bigtts" },
  { id: "gentle-male", label: "温柔男声", gender: "male", speaker: "zh_male_taocheng_uranus_bigtts" },
];

const clamp = (value: number) => Math.max(-50, Math.min(100, value));
const cleanTextForSpeech = (value: string) => value.replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "").replace(/[「」『』]/g, "").trim();

function makeFallbackOptions(round: number): Option[] {
  const pools: Option[][] = [
    [
      { id: "a", content: "我真的很抱歉，这件事是我疏忽了。今晚我来安排补过纪念日，好吗？", score: 18 },
      { id: "b", content: "我记得我们第一次见面的地方，想带你回去重新过一次。", score: 15 },
      { id: "c", content: "不就是个日子嘛，别这么较真。", score: -18 },
      { id: "d", content: "我给你表演一个倒立道歉，虽然可能会骨折。", score: -8 },
      { id: "e", content: "要不我们把今天定义成新的纪念日？数学上叫重新开始。", score: -12 },
      { id: "f", content: "我手机日历坏了，建议你起诉苹果。", score: -25 },
    ],
    [
      { id: "a", content: "我知道你等消息等得很难受，以后睡前我会先和你说一声。", score: 17 },
      { id: "b", content: "我先把游戏卸载一周，用行动让你安心。", score: 14 },
      { id: "c", content: "我又不是故意不回，你也可以多打几个电话啊。", score: -15 },
      { id: "d", content: "我昨晚和王者峡谷结婚了，今天就离。", score: -9 },
      { id: "e", content: "手机被外星人绑架了，我是刚逃回来的。", score: -24 },
      { id: "f", content: "下次我给你发摩斯密码，保证秒回。", score: -6 },
    ],
  ];
  const source = pools[(round - 1) % pools.length];
  return [...source].sort(() => Math.random() - 0.5);
}

function getAffectionColor(value: number) {
  if (value < 0) return "#ef4444";
  if (value < 30) return "#eab308";
  if (value < 60) return "#3b82f6";
  if (value < 80) return "#0ea5e9";
  return "#22c55e";
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("start");
  const [gender, setGender] = useState<Gender>("female");
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [voiceType, setVoiceType] = useState<VoiceType>("gentle-female");
  const [messages, setMessages] = useState<Message[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [affection, setAffection] = useState(20);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const partnerLabel = gender === "female" ? "她" : "他";
  const selectedVoice = useMemo(() => VOICES.find((voice) => voice.id === voiceType) ?? VOICES[0], [voiceType]);

  const speak = useCallback((message: Message) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanTextForSpeech(message.content));
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    utterance.onstart = () => setPlayingId(message.id);
    utterance.onend = () => setPlayingId(null);
    utterance.onerror = () => setPlayingId(null);
    window.speechSynthesis.speak(utterance);
  }, []);

  const generateRound = useCallback(async (history: Message[], nextStep: number, score: number, isOver = false, won = false) => {
    setLoading(true);
    setError("");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gender, scenario: scenario.title, messages: history, affection: score,
          step: nextStep, isGameOver: isOver, won,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error("对话生成失败，请重试。");
      const data = await response.json();
      const partnerMessage: Message = { id: `partner-${nextStep}-${Date.now()}`, role: "partner", content: data.partnerMessage };
      setMessages([...history, partnerMessage]);
      setOptions(Array.isArray(data.options) && data.options.length === 6 ? data.options : makeFallbackOptions(nextStep));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      console.error("Generate chat failed:", err);
      const fallback = makeFallbackOptions(nextStep);
      const text = nextStep === 1
        ? `（抱着手臂，眉头紧锁）${scenario.description} 你现在还有什么想说的吗？`
        : score < 0 ? "我现在真的很难过，你能不能先认真听听我的感受？" : "哼……你说的话我听见了，但我还想看看你的实际行动。";
      setMessages([...history, { id: `partner-${nextStep}-${Date.now()}`, role: "partner", content: text }]);
      setOptions(fallback);
      setError("AI 暂时没有回应，已切换到本地备用对话，不影响继续游戏。");
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  }, [gender, scenario]);

  const startGame = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setAffection(20);
    setStep(1);
    setMessages([]);
    setOptions([]);
    setScreen("game");
    await generateRound([], 1, 20);
  };

  const selectOption = async (option: Option) => {
    if (busyRef.current || loading || screen !== "game") return;
    busyRef.current = true;
    window.speechSynthesis?.cancel();
    setPlayingId(null);
    const nextScore = clamp(affection + option.score);
    const userMessage: Message = { id: `user-${step}-${Date.now()}`, role: "user", content: option.content };
    const history = [...messages, userMessage];
    setMessages(history);
    setAffection(nextScore);
    const isOver = nextScore < -50 || step >= 10 || nextScore >= 80;
    const won = nextScore >= 80;
    const nextStep = Math.min(step + 1, 10);
    setOptions([]);
    if (isOver) {
      setLoading(true);
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gender, scenario: scenario.title, messages: history, affection: nextScore, step, isGameOver: true, won }),
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) throw new Error("end message failed");
        const data = await response.json();
        setMessages([...history, { id: `partner-end-${Date.now()}`, role: "partner", content: data.partnerMessage }]);
      } catch (err) {
        console.error("Generate ending failed:", err);
        setMessages([...history, { id: `partner-end-${Date.now()}`, role: "partner", content: won ? "好啦……这次我原谅你了。下次不许再这样，拉钩！" : "我现在需要一点时间冷静。我们都先好好想想吧。" }]);
      } finally {
        setLoading(false);
        busyRef.current = false;
        setScreen("result");
      }
      return;
    }
    setStep(nextStep);
    await generateRound(history, nextStep, nextScore);
  };

  const restart = () => {
    window.speechSynthesis?.cancel();
    setScreen("start");
    setMessages([]);
    setOptions([]);
    setAffection(20);
    setStep(1);
    setError("");
    setPlayingId(null);
  };

  const progress = Math.max(0, Math.min(100, (affection / 100) * 100));
  const won = affection >= 80;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col">
        <header className="mb-6 text-center">
          <div className="mb-2 text-3xl">💗</div>
          <p className="text-xs font-bold tracking-[0.35em] text-rose-400">LOVE LAB · INTERACTIVE GAME</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-800 sm:text-4xl">哄哄模拟器</h1>
          <p className="mt-2 text-sm text-slate-500">十轮之内，让 TA 消消气。</p>
        </header>

        {screen === "start" && (
          <section className="glass-card my-auto rounded-[2rem] p-6 sm:p-9">
            <div className="mb-7 text-center">
              <span className="rounded-full bg-rose-100 px-4 py-1.5 text-xs font-bold text-rose-500">RELATIONSHIP CHALLENGE</span>
              <h2 className="mt-4 text-2xl font-extrabold text-slate-800">今天 TA 又生气啦？</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">选好对象和故事背景，看看你的求生欲能不能过关。</p>
            </div>
            <div className="space-y-6">
              <div>
                <div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-slate-700">01 · TA 的性别</h3><span className="text-xs text-slate-400">选择对象</span></div>
                <div className="grid grid-cols-2 gap-3">
                  {([{ value: "female", label: "👩 女生" }, { value: "male", label: "👨 男生" }] as const).map((item) => (
                    <button key={item.value} onClick={() => { setGender(item.value); setVoiceType(item.value === "female" ? "gentle-female" : "gentle-male"); }} className={`choice-card ${gender === item.value ? "choice-active" : ""}`}>{item.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-slate-700">02 · 选择翻车现场</h3><span className="text-xs text-slate-400">五选一</span></div>
                <div className="grid gap-2">
                  {SCENARIOS.map((item) => (
                    <button key={item.id} onClick={() => setScenario(item)} className={`scenario-card text-left ${scenario.id === item.id ? "scenario-active" : ""}`}>
                      <span className="flex items-center justify-between gap-3"><span className="font-bold">{item.title}</span><span className="text-lg">{scenario.id === item.id ? "💗" : "♡"}</span></span>
                      <span className="mt-1 block text-xs leading-5 opacity-70">{item.description}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-slate-700">03 · TA 的声音</h3><span className="text-xs text-slate-400">可随时调整</span></div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {VOICES.filter((voice) => voice.gender === gender).map((voice) => (
                    <button key={voice.id} onClick={() => setVoiceType(voice.id)} className={`voice-card ${voiceType === voice.id ? "voice-active" : ""}`}>{voice.label}</button>
                  ))}
                </div>
              </div>
              <button onClick={startGame} className="primary-button w-full">开始哄 TA <span>→</span></button>
              <p className="text-center text-[11px] text-slate-400">游戏共 10 轮 · 初始好感度 20 · 达到 80 即可通关</p>
            </div>
          </section>
        )}

        {screen !== "start" && (
          <section className="glass-card flex min-h-[70vh] flex-1 flex-col overflow-hidden rounded-[2rem]">
            <div className="border-b border-white/70 bg-white/45 px-5 py-4 sm:px-7">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div><p className="text-xs font-bold text-rose-400">TA 的好感度</p><p className="mt-0.5 text-xs text-slate-500">继续努力，TA 正在观察你的表现</p></div>
                <div className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-500">第 {Math.min(step, 10)} / 10 轮</div>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-200/80">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: getAffectionColor(affection) }} />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>💔 冰点</span><span>💗 心动</span><span>💕 原谅</span></div>
            </div>

            <div className="chat-scroll flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-7">
              <div className="mx-auto w-fit rounded-full bg-white/70 px-4 py-1.5 text-[11px] text-slate-500 shadow-sm">{scenario.title} · 现在开始你的解释</div>
              {messages.map((message) => (
                <div key={message.id} className={`flex items-end gap-2.5 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  {message.role === "partner" && <div className="avatar avatar-partner">TA</div>}
                  <div className={`message-bubble ${message.role === "user" ? "message-user" : "message-partner"}`}>
                    <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
                    {message.role === "partner" && <button onClick={() => speak(message)} className="mt-2 flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-600">{playingId === message.id ? "♫ 正在播放" : "🔊 播放语音"}</button>}
                  </div>
                  {message.role === "user" && <div className="avatar avatar-user">我</div>}
                </div>
              ))}
              {loading && <div className="flex items-center gap-3"><div className="avatar avatar-partner">TA</div><div className="rounded-2xl bg-white px-5 py-3 text-sm text-slate-500 shadow-sm"><span className="mr-2 inline-block animate-pulse">💗</span>{partnerLabel}正在思考...</div></div>}
              <div ref={chatEndRef} />
            </div>

            {error && <div className="mx-4 mb-2 rounded-xl bg-amber-50 px-4 py-2 text-xs leading-5 text-amber-700 sm:mx-7">{error}</div>}

            {screen === "game" && (
              <div className="border-t border-white/70 bg-white/55 p-4 sm:p-6">
                <p className="mb-3 text-xs font-bold text-slate-500">选一句你想说的话</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {options.map((option, index) => (
                    <button key={option.id} disabled={loading} onClick={() => selectOption(option)} className="option-button text-left">
                      <span className="mr-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-50 text-[11px] font-bold text-rose-400">{index + 1}</span>
                      <span className="text-sm leading-6">{option.content}</span>
                    </button>
                  ))}
                </div>
                {!options.length && !loading && <button onClick={() => generateRound(messages, step, affection)} className="mt-2 w-full rounded-xl bg-rose-100 p-3 text-sm font-bold text-rose-600">重新生成选项</button>}
              </div>
            )}

            {screen === "result" && (
              <div className="border-t border-white/70 bg-white/60 p-7 text-center">
                <div className="text-5xl">{won ? "🎉" : "💔"}</div>
                <h2 className="mt-3 text-2xl font-black text-slate-800">{won ? "哄好了！通关成功" : "这次没能哄好 TA"}</h2>
                <p className="mt-2 text-sm text-slate-500">{won ? "撒花！你的求生欲和真诚终于打动了 TA。" : "别灰心，认真复盘一下，再给彼此一次机会。"}</p>
                <button onClick={restart} className="primary-button mt-6 w-full">再玩一次 <span>↻</span></button>
                <p className="mt-3 text-[11px] text-slate-400">把结果分享给朋友，看看谁才是哄人高手。</p>
              </div>
            )}
          </section>
        )}
        <footer className="mt-6 text-center text-[10px] tracking-wide text-slate-400">MADE WITH 💗 · 哄哄模拟器</footer>
      </div>
    </main>
  );
}
