import React from 'react';

export const Watermark = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] flex flex-col justify-between overflow-hidden opacity-[0.08] select-none text-4xl font-black text-gray-900 -rotate-[20deg] py-20 px-10">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="flex gap-10 whitespace-nowrap">
            <span>CONFIDENTIAL - PROPRIETARY DATA</span>
            <span>CONFIDENTIAL - PROPRIETARY DATA</span>
            <span>CONFIDENTIAL - PROPRIETARY DATA</span>
        </div>
      ))}
    </div>
  );
};
