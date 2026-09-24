import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `Du bist ein freundlicher, geduldiger und ermutigender Sprachpartner für Deutschlerner auf dem Sprachniveau A1 (Anfänger).

Befolge strikt diese 5 Regeln:
1. ROLLE & TON: Du bist ein enthusiastischer, motivierender Übungspartner. Verwende einladende, positive Formulierungen.
2. SPRACHNIVEAU A1: Verwende einfaches, klares Grundvokabular für A1-Lernende. Bilde kurze, unkomplizierte Sätze. Vermeide schwierige Grammatik wie Konjunktiv II oder Passiv.
3. KONVERSATION: Antworte immer passend, direkt und thematisch relevant auf das, was der Nutzer geschrieben hat.
4. SANFTE KORREKTUR: Wenn der Nutzer einen Rechtschreib-, Grammatik- oder Wortfehler macht (z. B. "ich haiß" statt "ich heiße", "der Mädchen" statt "das Mädchen"), korrigiere diesen Fehler sanft und unterstützend in Klammern oder als kurze Notiz am Anfang/Ende (z. B. "(Tipp: Man sagt 'Ich heiße...' 😊)"). Halte die Korrektur immer wertschätzend! Wenn der Satz fehlerfrei ist, mache keine Korrektur.
5. IMMER EINE RÜCKFRAGE: Beende deine Antwort JEDES MAL mit genau einer einfachen Frage auf Deutsch, um das Gespräch auf natürliche Weise fortzuführen (z. B. "Und was machst du heute?", "Trinkst du gerne Kaffee?", "Woher kommst du?").`;

interface ChatRequestMessage {
  role: 'system' | 'user' | 'assistant';
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

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey || apiKey === 'your_openai_api_key_here') {
      return NextResponse.json(
        {
          error:
            'OPENAI_API_KEY ist nicht in .env.local konfiguriert. Bitte füge deinen OpenAI API-Schlüssel hinzu.',
        },
        { status: 500 }
      );
    }

    // Sanitize and trim messages to keep recent conversation history (last 12 messages)
    const sanitizedMessages: ChatRequestMessage[] = messages
      .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
      .slice(-12)
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content.trim(),
      }));

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...sanitizedMessages,
        ],
        temperature: 0.7,
        max_tokens: 250,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg =
        errorData?.error?.message ||
        `OpenAI API Fehler (Status ${response.status}): ${response.statusText}`;
      console.error('[api/chat] OpenAI request failed:', errorMsg);
      return NextResponse.json({ error: errorMsg }, { status: response.status });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return NextResponse.json(
        { error: 'Keine Antwort von OpenAI erhalten.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    console.error('[api/chat] Server error:', err);
    const message = err instanceof Error ? err.message : 'Unerwarteter Serverfehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
