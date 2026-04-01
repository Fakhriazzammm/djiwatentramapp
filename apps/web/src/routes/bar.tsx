import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/bar')({
  component: () => <div>Bar Layout (Loading...)</div>
})
