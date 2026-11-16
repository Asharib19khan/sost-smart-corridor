// Customs console: /c queue and /c/s/:id shipment view. Officers sign decisions in this browser.
import './lib/tool.css'
import { Route, Routes } from 'react-router-dom'
import { Guard, ToolShell } from './lib/ui'
import Queue from './Queue'
import ShipmentView from './ShipmentView'

export default function CustomsApp() {
  return (
    <Guard roles={['customs', 'admin']}>
      <ToolShell>
        <Routes>
          <Route index element={<Queue />} />
          <Route path="s/:id" element={<ShipmentView />} />
          <Route path="*" element={<Queue />} />
        </Routes>
      </ToolShell>
    </Guard>
  )
}
