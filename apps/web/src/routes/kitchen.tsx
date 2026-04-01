import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/kitchen')({
  component: () => <div>Kitchen Layout (Loading...)</div>
})
