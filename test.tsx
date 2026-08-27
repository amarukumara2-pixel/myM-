import React from 'react';
import { createPortal } from 'react-dom';

export default function Test() {
  return (
    <div>
      {createPortal(
        <div>Hello</div>
      , document.body)}
    </div>
  );
}
