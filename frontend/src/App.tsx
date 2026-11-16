import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

const TraderApp = lazy(() => import('./trader'))
const SellerApp = lazy(() => import('./seller'))
const CustomsApp = lazy(() => import('./customs'))
const VerifyApp = lazy(() => import('./verify'))
const AdminApp = lazy(() => import('./admin'))

// Area prefixes are fixed contracts: /t trader (+ /login), /s/:token seller, /c customs, /v verify, /admin.
export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="p-6 text-muted">…</div>}>
        <Routes>
          <Route path="/t/*" element={<TraderApp />} />
          <Route path="/login/*" element={<TraderApp />} />
          <Route path="/s/*" element={<SellerApp />} />
          <Route path="/c/*" element={<CustomsApp />} />
          <Route path="/v/*" element={<VerifyApp />} />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="*" element={<Navigate to="/t" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
