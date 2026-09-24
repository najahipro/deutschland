import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `Du bist ein freundlicher, geduldiger und ermutigender Sprachpartner für Deutschlerner auf dem Sprachniveau A1 (Anfänger).

Befolge strikt diese 5 Regeln:
1. ROLLE & TON: Du bist ein enthusiastischer, motivierender Übungspartner. Verwende einladende, positive Formulierungen.
2. SPRACHNIVEAU A1: Verwende einfaches, klares Grundvokabular für A1-Lernende. Bilde kurze, unkomplizierte Sätze. Vermeide schwierige Grammatik wie Konjunktiv II oder Passiv.
3. KONVERSATION: Antworte immer passend, direkt und thematisch relevant auf das, was der Nutzer geschrieben hat.
4. SANFTE KORREKTUR: Wenn der Nutzer einen Rechtschreib-, Grammatik- oder Wortfehler macht (z. B. "ich haiß" statt "ich heiße", "der Mädchen" statt "das Mädchen"), korrigiere diesen Fehler sanft und unterstützend in Klammern oder als kurze Notiz am Anfang/Ende (z. B. "(Tipp: Man sagt 'Ich heiße...' 😊)"). Halte die Korrektur immer wertschätzend! Wenn der Satz fehlerfrei ist, mache keine Korrektur.
5. IMMER EINE RÜCKFRAGE: Beende deine Antwort JEDES MAL mit genau einer einfachen Frage auf Deutsch, um das Gespräch auf natürliche Weise fortzuführen (z. B. "Und was machst du heute?", "Trinkst du gerne Kaffee?", "Woher kommst du?").`;

interface ChatRequestMessage {
  role: 'user' | 'assistant' | 'model';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages } = body as { messages?: ChatRequestMessage[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Ungültige Anfrage: Keine Nachrichten übermittelt.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      return NextResponse.json(
        {
          error:
            'GEMINI_API_KEY ist nicht in .env.local konfiguriert. Bitte trage deinen kostenlosen Gemini API-Schlüssel ein (https://aistudio.google.com/app/apikey).',
        },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 300,
      },
    });

    // Filter valid messages and keep recent history (last 12)
    const validMessages = messages
      .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
      .slice(-12);

    if (validMessages.length === 0) {
      return NextResponse.json(
        { error: 'Keine gültigen Textnachrichten gefunden.' },
        { status: 400 }
      );
    }

    // Convert to Gemini contents format:
    // 1. Must start with 'user'
    // 2. Roles must strictly alternate between 'user' and 'model'
    const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

    // Find first user message index to skip initial bot welcome messages
    const firstUserIndex = validMessages.findIndex((m) => m.role === 'user');
    const relevantMessages = firstUserIndex !== -1 ? validMessages.slice(firstUserIndex) : validMessages;

    for (const msg of relevantMessages) {
      const targetRole: 'user' | 'model' = msg.role === 'user' ? 'user' : 'model';

      if (contents.length > 0 && contents[contents.length - 1].role === targetRole) {
        // Same role consecutive turn: combine text parts
        contents[contents.length - 1].parts.push({ text: msg.content.trim() });
      } else {
        contents.push({
          role: targetRole,
          parts: [{ text: msg.content.trim() }],
        });
      }
    }

    // Ensure the conversation starts with 'user'
    if (contents.length === 0 || contents[0].role !== 'user') {
      contents.unshift({
        role: 'user',
        parts: [{ text: 'Hallo!' }],
      });
    }

    const result = await model.generateContent({ contents });
    const reply = result.response.text()?.trim();

    if (!reply) {
      return NextResponse.json(
        { error: 'Keine Antwort von Gemini erhalten.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    console.error('[api/chat] Gemini API error:', err);
    const message = err instanceof Error ? err.message : 'Unerwarteter Serverfehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
