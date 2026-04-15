"use client";

import Image from "next/image";
import { useCallback, useState } from "react";

export type InstallationCard = {
  label: string;
  description: string;
  iconSrc: string;
  iconAlt: string;
  href?: string;
  copyText?: string;
};

interface InstallationGridProps {
  cards: InstallationCard[];
}

export function InstallationGrid({ cards }: InstallationGridProps) {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  const handleCopy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLabel(label);
      setTimeout(() => {
        setCopiedLabel((current) => (current === label ? null : current));
      }, 2000);
    } catch (error) {
      console.error("Failed to copy MCP config", error);
    }
  }, []);

  return (
    <div className="grid gap-3 md:grid-cols-3 auto-rows-fr">
      {cards.map((card) => {
        const content = (
          <>
            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Image
                src={card.iconSrc}
                alt={card.iconAlt}
                width={40}
                height={40}
                className="object-contain"
              />
            </div>
            <div className="space-y-1 text-center">
              <p className="text-sm text-white font-serif font-semibold">{card.label}</p>
              <p className="text-xs text-slate-300/80 font-medium">{card.description}</p>
            </div>
            {card.copyText && copiedLabel === card.label && (
              <p className="text-[0.6rem] uppercase tracking-[0.35em] text-emerald-300/80 text-center">
                copied
              </p>
            )}
          </>
        );

        if (card.copyText) {
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => handleCopy(card.copyText!, card.label)}
              className="border border-white/10 rounded-2xl p-4 bg-black/20 backdrop-blur hover:border-emerald-400/60 transition flex flex-col gap-3 h-full items-center text-center"
            >
              {content}
            </button>
          );
        }

        return (
          <a
            key={card.label}
            href={card.href}
            target="_blank"
            rel="noreferrer"
            className="border border-white/10 rounded-2xl p-4 bg-black/20 backdrop-blur hover:border-emerald-400/60 transition flex flex-col gap-3 h-full items-center text-center"
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}
