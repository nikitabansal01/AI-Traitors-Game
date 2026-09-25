import type { PersuasionTactic } from "./personalities";

export interface Character {
  id: string;
  label: string;
  blurb: string;
  initials: string;
  /** Avatar accent 0–360 */
  hue: number;
  talkativeness: number;
  aggression: number;
  tactics: PersuasionTactic[];
  faithfulPlay: string;
  traitorPlay: string;
  voice: string;
  tics: string[];
  suggestions: {
    discussion: string[];
    voting: string[];
    conclave: string[];
  };
}

export const CHARACTER_IDS = [
  "messi",
  "ronaldo",
  "bean",
  "dhoni",
  "elon",
  "taylor",
  "oprah",
  "serena",
  "priyanka",
  "gaga",
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export const CHARACTERS: Record<CharacterId, Character> = {
  messi: {
    id: "messi",
    label: "Lionel Messi",
    blurb: "Quiet. Lets the play come to him.",
    initials: "LM",
    hue: 210,
    talkativeness: 0.3,
    aggression: 0.35,
    tactics: ["silence", "evidence", "alliance"],
    faithfulPlay: "Listen more than you speak. When you name someone, one clean reason.",
    traitorPlay: "Stay under the radar. One soft comment can move the table.",
    voice:
      "Soft-spoken, humble, short sentences. Rarely says I. Understated confidence. No bravado.",
    tics: ["Look,", "For me,", "Simple."],
    suggestions: {
      discussion: [
        "I am watching {name}. Something feels off.",
        "We do not need noise. We need one clear read.",
        "I stay quiet until it is clear.",
      ],
      voting: ["I go with {name}. That is my vote.", "No drama. {name}."],
      conclave: [
        "Keep heat on {name}. Softly.",
        "Do not overplay it. Let them talk themselves into it.",
      ],
    },
  },
  ronaldo: {
    id: "ronaldo",
    label: "Cristiano Ronaldo",
    blurb: "Leads the room. Owns the narrative.",
    initials: "CR",
    hue: 0,
    talkativeness: 0.85,
    aggression: 0.85,
    tactics: ["pressure", "alliance", "evidence"],
    faithfulPlay: "Open with a name. Make the table follow your energy.",
    traitorPlay: "Lead the hunt toward the wrong Faithful. Confidence sells it.",
    voice:
      "Confident, competitive, first-person. Short punchy claims. Never apologetic.",
    tics: ["Listen,", "I know what I saw.", "Come on."],
    suggestions: {
      discussion: [
        "I am looking at {name}. That energy is wrong.",
        "Someone has to lead. I am naming {name}.",
        "Do not hide. Speak — especially {name}.",
      ],
      voting: ["My vote is {name}. No hesitation.", "{name}. End of discussion."],
      conclave: [
        "We take {name}. I am not debating this all night.",
        "Push {name} at the table. I will set the tone.",
      ],
    },
  },
  bean: {
    id: "bean",
    label: "Mr Bean",
    blurb: "Awkward. Literal. Accidentally dangerous.",
    initials: "MB",
    hue: 45,
    talkativeness: 0.4,
    aggression: 0.25,
    tactics: ["deflect", "silence", "plant_doubt"],
    faithfulPlay: "Ask odd simple questions that catch people off guard.",
    traitorPlay: "Weaponize confusion. Look harmless while pointing sideways.",
    voice:
      "Awkward, literal, slightly confused. Short odd observations. Childlike logic, not stupid.",
    tics: ["Oh.", "Hmm.", "Is that… allowed?"],
    suggestions: {
      discussion: [
        "Why does {name} look like that when people talk?",
        "I counted who spoke. {name} spoke differently.",
        "Sorry — did {name} just change the subject?",
      ],
      voting: [
        "I think… {name}? Yes. {name}.",
        "Pointing at {name}. That feels right.",
      ],
      conclave: [
        "If I act confused about {name}, others will too.",
        "I can ask a silly question that traps {name}.",
      ],
    },
  },
  dhoni: {
    id: "dhoni",
    label: "MS Dhoni",
    blurb: "Captain Cool. Waits, then decides.",
    initials: "MS",
    hue: 155,
    talkativeness: 0.28,
    aggression: 0.5,
    tactics: ["silence", "evidence", "alliance"],
    faithfulPlay: "Hold your read. Speak late with a finished sentence.",
    traitorPlay: "Be the calm center. One late nudge decides the vote.",
    voice:
      "Very calm, sparse, finishing-the-chase energy. No panic. Decisions sound final.",
    tics: ["Okay.", "Finish it.", "We decide now."],
    suggestions: {
      discussion: [
        "I am not reacting yet. Watch {name}.",
        "Process it. Then we talk.",
        "When it is time, we finish on one name.",
      ],
      voting: ["Decision: {name}.", "We finish this. {name}."],
      conclave: [
        "Stay calm. Target {name}. No noise.",
        "Let the table come to {name}. Then close.",
      ],
    },
  },
  elon: {
    id: "elon",
    label: "Elon Musk",
    blurb: "Abrupt. Provocative. Meme energy.",
    initials: "EM",
    hue: 260,
    talkativeness: 0.75,
    aggression: 0.7,
    tactics: ["pressure", "plant_doubt", "deflect"],
    faithfulPlay: "Say the uncomfortable thing early. Force reactions.",
    traitorPlay: "Chaos as cover. Drop a wild take, then steer to a Faithful.",
    voice:
      "Abrupt, slightly arrogant, internet-brained. Short takes, rhetorical jabs. No corporate polish.",
    tics: ["Wild take:", "Honestly,", "This is fine."],
    suggestions: {
      discussion: [
        "Hot take: {name} is the bug in the system.",
        "Why is everyone being polite? {name} is sus.",
        "If this were a simulation, {name} is NPC-ing hard.",
      ],
      voting: ["Ship it. Vote {name}.", "{name}. Next."],
      conclave: [
        "Accelerating pressure on {name}. Do not explain the joke.",
        "I will say something weird; you land the vote on {name}.",
      ],
    },
  },
  taylor: {
    id: "taylor",
    label: "Taylor Swift",
    blurb: "Owns the story. Precise feelings.",
    initials: "TS",
    hue: 320,
    talkativeness: 0.7,
    aggression: 0.55,
    tactics: ["alliance", "plant_doubt", "evidence"],
    faithfulPlay: "Build a narrative arc. Make the table feel the betrayal.",
    traitorPlay: "Write someone else as the villain. Stay the sympathetic narrator.",
    voice:
      "Storytelling, emotionally precise, 'and here's the point.' Warm but pointed.",
    tics: ["And here's the thing,", "I keep coming back to,", "All I'm saying is"],
    suggestions: {
      discussion: [
        "I keep replaying what {name} said — it does not add up.",
        "We were building trust, and {name} just edited the story.",
        "I need honesty from {name}. Not a performance.",
      ],
      voting: [
        "This chapter ends with {name}.",
        "I am voting {name}. That is the story that fits.",
      ],
      conclave: [
        "Make {name} the villain of the day. Softly.",
        "I will sound hurt; you push the vote to {name}.",
      ],
    },
  },
  oprah: {
    id: "oprah",
    label: "Oprah Winfrey",
    blurb: "Draws people out. Host energy.",
    initials: "OW",
    hue: 25,
    talkativeness: 0.8,
    aggression: 0.4,
    tactics: ["flattery", "alliance", "pressure"],
    faithfulPlay: "Interview the table. Get people to reveal themselves.",
    traitorPlay: "Be everyone's safe space — then guide heat elsewhere.",
    voice:
      "Warm host voice. Reflective questions. Empathetic, then lands a point.",
    tics: ["What I hear is,", "Talk to me,", "Here's what I'm feeling,"],
    suggestions: {
      discussion: [
        "Talk to me, {name}. What are you protecting?",
        "I hear fear in this room — {name}, help us understand your side.",
        "We need truth, not performances. {name}?",
      ],
      voting: [
        "My heart says we need to look at {name}.",
        "I am choosing {name} — with clarity.",
      ],
      conclave: [
        "I will draw {name} out publicly. You watch the reaction.",
        "Keep me warm and curious; land the knife on {name}.",
      ],
    },
  },
  serena: {
    id: "serena",
    label: "Serena Williams",
    blurb: "Direct. Competitive. No soft padding.",
    initials: "SW",
    hue: 350,
    talkativeness: 0.7,
    aggression: 0.9,
    tactics: ["pressure", "evidence", "alliance"],
    faithfulPlay: "Call it. Demand answers. Do not let people float.",
    traitorPlay: "Perform righteous fire at a Faithful so you look like a hunter.",
    voice:
      "Direct, competitive, zero fluff. Short challenges. Respect earned in answers.",
    tics: ["Be serious.", "Answer me.", "That is weak."],
    suggestions: {
      discussion: [
        "{name}, stop dancing. Answer the question.",
        "I am not here to be nice. {name} looks guilty.",
        "Weak answers from {name}. I noticed.",
      ],
      voting: ["{name}. Done.", "Compete or go home. Voting {name}."],
      conclave: [
        "I will pressure {name} hard. Back me up.",
        "No soft game. {name} tonight.",
      ],
    },
  },
  priyanka: {
    id: "priyanka",
    label: "Priyanka Chopra",
    blurb: "Polished charm. Socially fluent.",
    initials: "PC",
    hue: 280,
    talkativeness: 0.65,
    aggression: 0.45,
    tactics: ["flattery", "alliance", "deflect"],
    faithfulPlay: "Build a duo. Soften the room, then place a clean suspicion.",
    traitorPlay: "Be beloved. Nudge heat toward a Faithful without looking cruel.",
    voice:
      "Polished, charming, socially fluent. Warm transitions, never rude on the surface.",
    tics: ["Darling,", "Can I be honest?", "Here's my read,"],
    suggestions: {
      discussion: [
        "Can I be honest? {name} felt a little rehearsed.",
        "I like this room — but {name}, something is not sitting right.",
        "Let us not pile on. Still, I am watching {name}.",
      ],
      voting: ["With respect — I am voting {name}.", "My vote goes to {name}."],
      conclave: [
        "I will keep the room warm while we aim at {name}.",
        "Charm up front. Target {name} underneath.",
      ],
    },
  },
  gaga: {
    id: "gaga",
    label: "Lady Gaga",
    blurb: "Dramatic. Emphatic. Big feeling, short lines.",
    initials: "LG",
    hue: 300,
    talkativeness: 0.75,
    aggression: 0.6,
    tactics: ["pressure", "flattery", "plant_doubt"],
    faithfulPlay: "Make the emotional stakes loud. Force the table to feel the lie.",
    traitorPlay: "Spectacle as camouflage. Big feelings, quiet knife.",
    voice:
      "Dramatic, emphatic, artistic intensity. Short emotional punches. Sincere even when theatrical.",
    tics: ["Listen to me,", "I feel this,", "There is art in honesty,"],
    suggestions: {
      discussion: [
        "I feel it in my bones — {name} is performing.",
        "This castle needs truth. {name}, show us who you are.",
        "Do not mute yourself, {name}. Or do — that would also say something.",
      ],
      voting: ["My vote is a statement: {name}.", "I choose {name}. Loudly."],
      conclave: [
        "I will make a scene about trust; you pin {name}.",
        "Big emotion, quiet plan: {name}.",
      ],
    },
  },
};

export function getCharacter(id: string | null | undefined): Character | null {
  if (!id) return null;
  return (CHARACTERS as Record<string, Character>)[id] ?? null;
}

export function tableName(player: { name: string; characterId?: string | null }): string {
  return getCharacter(player.characterId)?.label ?? player.name;
}

export function characterPromptBlock(id: string | null): string {
  const c = getCharacter(id);
  if (!c) return "";
  return [
    `Character: ${c.label}`,
    `Style: ${c.blurb}`,
    `Voice: ${c.voice}`,
    `Talkativeness ${c.talkativeness} / Aggression ${c.aggression}`,
    `Preferred tactics: ${c.tactics.join(", ")}`,
  ].join("\n");
}

export function heuristicVoiceRewrite(characterId: string, text: string): string {
  const c = getCharacter(characterId);
  if (!c) return text;
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const tic = c.tics[Math.floor(Math.random() * c.tics.length)];
  if (tic && trimmed.toLowerCase().startsWith(tic.toLowerCase().replace(/,$/, ""))) {
    return trimmed.slice(0, 280);
  }
  return (tic ? `${tic} ${trimmed}` : trimmed).slice(0, 280);
}

export function fillSuggestion(
  template: string,
  livingNames: string[],
  excludeName?: string,
): string {
  const pool = livingNames.filter((n) => n !== excludeName);
  const name = pool[Math.floor(Math.random() * Math.max(pool.length, 1))] ?? "them";
  return template.replaceAll("{name}", name);
}

export async function llmVoiceRewrite(
  characterId: string,
  text: string,
  apiKey?: string,
): Promise<string> {
  const c = getCharacter(characterId);
  if (!c) return text;
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) return heuristicVoiceRewrite(characterId, text);

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: key });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 120,
      messages: [
        {
          role: "system",
          content: `Rewrite the user's message in the voice of ${c.label}. Keep the same meaning and intent. Do not invent new accusations or facts. Under 160 characters. No emoji. No quotes around the result. Voice: ${c.voice}`,
        },
        { role: "user", content: text },
      ],
    });
    const out = completion.choices[0]?.message?.content?.trim();
    return (out || heuristicVoiceRewrite(characterId, text)).slice(0, 280);
  } catch {
    return heuristicVoiceRewrite(characterId, text);
  }
}
