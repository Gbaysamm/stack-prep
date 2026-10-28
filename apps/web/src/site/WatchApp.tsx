/**
 * The lesson page on its own (/watch/:lessonId), loaded by App.tsx without the rest of the
 * student app: no sign-in check, no splash, nothing but the board, so the home page's lesson
 * window opens fast.
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { WatchPage } from './Watch.js';

export function WatchApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/watch/:lessonId" element={<WatchPage />} />
        <Route path="*" element={<WatchPage />} />
      </Routes>
    </BrowserRouter>
  );
}
