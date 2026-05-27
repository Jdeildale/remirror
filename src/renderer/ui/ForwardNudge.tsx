import React from 'react';

interface Props {
  text: string | null;
}

export function ForwardNudge({ text }: Props) {
  if (!text) return null;
  return (
    <div className="bg-[rgba(232,176,109,0.12)] border-l-[3px] border-sand rounded-[4px] px-[14px] py-3 mb-6">
      <div className="text-[11px] text-sand mb-1.5 font-semibold">For the rest of today</div>
      <p className="text-[13px] text-text leading-[1.55] m-0">{text}</p>
    </div>
  );
}
