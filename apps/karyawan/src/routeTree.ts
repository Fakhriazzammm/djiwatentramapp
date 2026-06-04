/* eslint-disable */

import { createFileRoute } from '@tanstack/react-router'

import { Route as rootRouteImport } from './routes/__root'
import { Route as LoginRouteImport } from './routes/login'
import { Route as AttendanceRouteImport } from './routes/attendance'
import { Route as UsernameRouteImport } from './routes/$username'
import { Route as UsernameIndexRouteImport } from './routes/$username/index'
import { Route as UsernameProfilRouteImport } from './routes/$username/profil'
import { Route as UsernameJadwalRouteImport } from './routes/$username/jadwal'

const IndexLazyRouteImport = createFileRoute('/')()

const LoginRoute = LoginRouteImport.update({
  id: '/login',
  path: '/login',
  getParentRoute: () => rootRouteImport,
} as any).lazy(() => import('./routes/login.lazy').then((d) => d.Route))
const AttendanceRoute = AttendanceRouteImport.update({
  id: '/attendance',
  path: '/attendance',
  getParentRoute: () => rootRouteImport,
} as any).lazy(() => import('./routes/attendance.lazy').then((d) => d.Route))
const UsernameRoute = UsernameRouteImport.update({
  id: '/$username',
  path: '/$username',
  getParentRoute: () => rootRouteImport,
} as any).lazy(() => import('./routes/$username.lazy').then((d) => d.Route))
const IndexLazyRoute = IndexLazyRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any).lazy(() => import('./routes/index.lazy').then((d) => d.Route))

// ── Child routes of /$username ──────────────────────────────────────
const UsernameIndexRoute = UsernameIndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => UsernameRoute,
} as any).lazy(() =>
  import('./routes/$username/index.lazy').then((d) => d.Route),
)
const UsernameProfilRoute = UsernameProfilRouteImport.update({
  id: '/profil',
  path: '/profil',
  getParentRoute: () => UsernameRoute,
} as any).lazy(() =>
  import('./routes/$username/profil.lazy').then((d) => d.Route),
)
const UsernameJadwalRoute = UsernameJadwalRouteImport.update({
  id: '/jadwal',
  path: '/jadwal',
  getParentRoute: () => UsernameRoute,
} as any).lazy(() =>
  import('./routes/$username/jadwal.lazy').then((d) => d.Route),
)

// ── Types ───────────────────────────────────────────────────────────
export interface FileRoutesByFullPath {
  '/': typeof IndexLazyRoute
  '/$username': typeof UsernameRouteWithChildren
  '/attendance': typeof AttendanceRoute
  '/login': typeof LoginRoute
  '/$username/jadwal': typeof UsernameJadwalRoute
  '/$username/profil': typeof UsernameProfilRoute
  '/$username/': typeof UsernameIndexRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexLazyRoute
  '/attendance': typeof AttendanceRoute
  '/login': typeof LoginRoute
  '/$username/jadwal': typeof UsernameJadwalRoute
  '/$username/profil': typeof UsernameProfilRoute
  '/$username': typeof UsernameIndexRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexLazyRoute
  '/$username': typeof UsernameRouteWithChildren
  '/attendance': typeof AttendanceRoute
  '/login': typeof LoginRoute
  '/$username/jadwal': typeof UsernameJadwalRoute
  '/$username/profil': typeof UsernameProfilRoute
  '/$username/': typeof UsernameIndexRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths:
    | '/'
    | '/$username'
    | '/attendance'
    | '/login'
    | '/$username/jadwal'
    | '/$username/profil'
    | '/$username/'
  fileRoutesByTo: FileRoutesByTo
  to:
    | '/'
    | '/attendance'
    | '/login'
    | '/$username/jadwal'
    | '/$username/profil'
    | '/$username'
  id:
    | '__root__'
    | '/'
    | '/$username'
    | '/attendance'
    | '/login'
    | '/$username/jadwal'
    | '/$username/profil'
    | '/$username/'
  fileRoutesById: FileRoutesById
}

// ── Children wiring ─────────────────────────────────────────────────
interface UsernameRouteChildren {
  UsernameJadwalRoute: typeof UsernameJadwalRoute
  UsernameProfilRoute: typeof UsernameProfilRoute
  UsernameIndexRoute: typeof UsernameIndexRoute
}

const UsernameRouteChildren: UsernameRouteChildren = {
  UsernameJadwalRoute: UsernameJadwalRoute,
  UsernameProfilRoute: UsernameProfilRoute,
  UsernameIndexRoute: UsernameIndexRoute,
}

const UsernameRouteWithChildren = UsernameRoute._addFileChildren(
  UsernameRouteChildren,
)

export interface RootRouteChildren {
  IndexLazyRoute: typeof IndexLazyRoute
  AttendanceRoute: typeof AttendanceRoute
  UsernameRoute: typeof UsernameRouteWithChildren
  LoginRoute: typeof LoginRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/login': {
      id: '/login'
      path: '/login'
      fullPath: '/login'
      preLoaderRoute: typeof LoginRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/attendance': {
      id: '/attendance'
      path: '/attendance'
      fullPath: '/attendance'
      preLoaderRoute: typeof AttendanceRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/$username': {
      id: '/$username'
      path: '/$username'
      fullPath: '/$username'
      preLoaderRoute: typeof UsernameRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexLazyRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/$username/': {
      id: '/$username/'
      path: '/'
      fullPath: '/$username/'
      preLoaderRoute: typeof UsernameIndexRouteImport
      parentRoute: typeof UsernameRoute
    }
    '/$username/profil': {
      id: '/$username/profil'
      path: '/profil'
      fullPath: '/$username/profil'
      preLoaderRoute: typeof UsernameProfilRouteImport
      parentRoute: typeof UsernameRoute
    }
    '/$username/jadwal': {
      id: '/$username/jadwal'
      path: '/jadwal'
      fullPath: '/$username/jadwal'
      preLoaderRoute: typeof UsernameJadwalRouteImport
      parentRoute: typeof UsernameRoute
    }
  }
}

/* ⚠️ IMPORTANT: AttendanceRoute must come BEFORE UsernameRoute
   for static route priority. `$username` (ASCII 36) sorts before
   `attendance` (ASCII 97) in filesystem order, so the auto-gen
   puts it in the wrong position. This file is NOT auto-generated
   and preserves the correct child ordering. */
const rootRouteChildren: RootRouteChildren = {
  IndexLazyRoute: IndexLazyRoute,
  AttendanceRoute: AttendanceRoute, /* static first — must be before dynamic */
  UsernameRoute: UsernameRouteWithChildren,
  LoginRoute: LoginRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()
