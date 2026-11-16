// Trader area: /login and /t/*. Every /t screen needs a session; otherwise we go to /login.
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Home from './screens/Home'
import Hub from './screens/Hub'
import Login from './screens/Login'
import Scan from './screens/Scan'
import Review from './screens/Review'
import Pay from './screens/Pay'
import Seal from './screens/Seal'
import Track from './screens/Track'
import { DutyScreen, Wallet } from './screens/Wallet'
import { useSession } from './lib/session'

export default function TraderApp() {
  const s = useSession()
  const { pathname } = useLocation()
  if (pathname.startsWith('/login')) return <Login />
  if (!s) return <Navigate to="/login" replace />
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path="wallet" element={<Wallet />} />
      <Route path="s/:id" element={<Hub />} />
      <Route path="s/:id/scan" element={<Scan />} />
      <Route path="s/:id/review" element={<Review />} />
      <Route path="s/:id/pay" element={<Pay />} />
      <Route path="s/:id/seal" element={<Seal />} />
      <Route path="s/:id/track" element={<Track />} />
      <Route path="s/:id/duty" element={<DutyScreen />} />
      <Route path="*" element={<Navigate to="/t" replace />} />
    </Routes>
  )
}
