/* eslint-disable */

import { createFileRoute } from '@tanstack/react-router'

import { Route as rootRouteImport } from './routes/__root'
import { Route as LoginRouteImport } from './routes/login'
import { Route as UsernameRouteImport } from './routes/$username'
import { Route as UsernameIndexRouteImport } from './routes/$username/index'
import { Route as UsernameBerandaRouteImport } from './routes/$username/beranda'
import { Route as UsernameAbsensiRouteImport } from './routes/$username/absensi'
import { Route as UsernameProfilRouteImport } from './routes/$username/profil'
import { Route as UsernameJadwalRouteImport } from './routes/$username/jadwal'
import { Route as UsernameNotifikasiRouteImport } from './routes/$username/notifikasi'
import { Route as UsernameLeaderboardRouteImport } from './routes/$username/leaderboard'
import { Route as UsernameIzinRouteImport } from './routes/$username/izin'

const IndexLazyRouteImport = createFileRoute('/')()

const LoginRoute = LoginRouteImport.update({
  id: '/login',
  path: '/login',
  getParentRoute: () => rootRouteImport,
} as any).lazy(() => import('./routes/login.lazy').then((d) => d.Route))
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
const UsernameBerandaRoute = UsernameBerandaRouteImport.update({
  id: '/beranda',
  path: '/beranda',
  getParentRoute: () => UsernameRoute,
} as any).lazy(() =>
  import('./routes/$username/beranda.lazy').then((d) => d.Route),
)
const UsernameAbsensiRoute = UsernameAbsensiRouteImport.update({
  id: '/absensi',
  path: '/absensi',
  getParentRoute: () => UsernameRoute,
} as any).lazy(() =>
  import('./routes/$username/absensi.lazy').then((d) => d.Route),
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
const UsernameNotifikasiRoute = UsernameNotifikasiRouteImport.update({
  id: '/notifikasi',
  path: '/notifikasi',
  getParentRoute: () => UsernameRoute,
} as any).lazy(() =>
  import('./routes/$username/notifikasi.lazy').then((d) => d.Route),
)
const UsernameLeaderboardRoute = UsernameLeaderboardRouteImport.update({
  id: '/leaderboard',
  path: '/leaderboard',
  getParentRoute: () => UsernameRoute,
} as any).lazy(() =>
  import('./routes/$username/leaderboard.lazy').then((d) => d.Route),
)
const UsernameIzinRoute = UsernameIzinRouteImport.update({
  id: '/izin',
  path: '/izin',
  getParentRoute: () => UsernameRoute,
} as any).lazy(() =>
  import('./routes/$username/izin.lazy').then((d) => d.Route),
)

// ── Types ───────────────────────────────────────────────────────────
export interface FileRoutesByFullPath {
  '/': typeof IndexLazyRoute
  '/$username': typeof UsernameRouteWithChildren
  '/login': typeof LoginRoute
  '/$username/': typeof UsernameIndexRoute
  '/$username/beranda': typeof UsernameBerandaRoute
  '/$username/absensi': typeof UsernameAbsensiRoute
  '/$username/jadwal': typeof UsernameJadwalRoute
  '/$username/notifikasi': typeof UsernameNotifikasiRoute
  '/$username/leaderboard': typeof UsernameLeaderboardRoute
  '/$username/izin': typeof UsernameIzinRoute
  '/$username/profil': typeof UsernameProfilRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexLazyRoute
  '/login': typeof LoginRoute
  '/$username': typeof UsernameIndexRoute
  '/$username/beranda': typeof UsernameBerandaRoute
  '/$username/absensi': typeof UsernameAbsensiRoute
  '/$username/jadwal': typeof UsernameJadwalRoute
  '/$username/notifikasi': typeof UsernameNotifikasiRoute
  '/$username/leaderboard': typeof UsernameLeaderboardRoute
  '/$username/izin': typeof UsernameIzinRoute
  '/$username/profil': typeof UsernameProfilRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexLazyRoute
  '/$username': typeof UsernameRouteWithChildren
  '/login': typeof LoginRoute
  '/$username/': typeof UsernameIndexRoute
  '/$username/beranda': typeof UsernameBerandaRoute
  '/$username/absensi': typeof UsernameAbsensiRoute
  '/$username/jadwal': typeof UsernameJadwalRoute
  '/$username/notifikasi': typeof UsernameNotifikasiRoute
  '/$username/leaderboard': typeof UsernameLeaderboardRoute
  '/$username/izin': typeof UsernameIzinRoute
  '/$username/profil': typeof UsernameProfilRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRouteTypes
  fullPaths:
    | '/'
    | '/$username'
    | '/login'
    | '/$username/'
    | '/$username/beranda'
    | '/$username/absensi'
    | '/$username/jadwal'
    | '/$username/notifikasi'
    | '/$username/leaderboard'
    | '/$username/izin'
    | '/$username/profil'
  fileRoutesByTo: FileRouteTypes
  to:
    | '/'
    | '/login'
    | '/$username'
    | '/$username/beranda'
    | '/$username/absensi'
    | '/$username/jadwal'
    | '/$username/notifikasi'
    | '/$username/leaderboard'
    | '/$username/izin'
    | '/$username/profil'
  id:
    | '__root__'
    | '/'
    | '/$username'
    | '/login'
    | '/$username/'
    | '/$username/beranda'
    | '/$username/absensi'
    | '/$username/jadwal'
    | '/$username/notifikasi'
    | '/$username/leaderboard'
    | '/$username/izin'
    | '/$username/profil'
  fileRoutesById: FileRouteTypes
}

// ── Children wiring ─────────────────────────────────────────────────
interface UsernameRouteChildren {
  UsernameIndexRoute: typeof UsernameIndexRoute
  UsernameBerandaRoute: typeof UsernameBerandaRoute
  UsernameAbsensiRoute: typeof UsernameAbsensiRoute
  UsernameJadwalRoute: typeof UsernameJadwalRoute
  UsernameNotifikasiRoute: typeof UsernameNotifikasiRoute
  UsernameLeaderboardRoute: typeof UsernameLeaderboardRoute
  UsernameIzinRoute: typeof UsernameIzinRoute
  UsernameProfilRoute: typeof UsernameProfilRoute
}

const UsernameRouteChildren: UsernameRouteChildren = {
  UsernameIndexRoute: UsernameIndexRoute,
  UsernameBerandaRoute: UsernameBerandaRoute,
  UsernameAbsensiRoute: UsernameAbsensiRoute,
  UsernameJadwalRoute: UsernameJadwalRoute,
  UsernameNotifikasiRoute: UsernameNotifikasiRoute,
  UsernameLeaderboardRoute: UsernameLeaderboardRoute,
  UsernameIzinRoute: UsernameIzinRoute,
  UsernameProfilRoute: UsernameProfilRoute,
}

const UsernameRouteWithChildren = UsernameRoute._addFileChildren(
  UsernameRouteChildren,
)

export interface RootRouteChildren {
  IndexLazyRoute: typeof IndexLazyRoute
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
    '/$username/beranda': {
      id: '/$username/beranda'
      path: '/beranda'
      fullPath: '/$username/beranda'
      preLoaderRoute: typeof UsernameBerandaRouteImport
      parentRoute: typeof UsernameRoute
    }
    '/$username/absensi': {
      id: '/$username/absensi'
      path: '/absensi'
      fullPath: '/$username/absensi'
      preLoaderRoute: typeof UsernameAbsensiRouteImport
      parentRoute: typeof UsernameRoute
    }
    '/$username/jadwal': {
      id: '/$username/jadwal'
      path: '/jadwal'
      fullPath: '/$username/jadwal'
      preLoaderRoute: typeof UsernameJadwalRouteImport
      parentRoute: typeof UsernameRoute
    }
    '/$username/notifikasi': {
      id: '/$username/notifikasi'
      path: '/notifikasi'
      fullPath: '/$username/notifikasi'
      preLoaderRoute: typeof UsernameNotifikasiRouteImport
      parentRoute: typeof UsernameRoute
    }
    '/$username/leaderboard': {
      id: '/$username/leaderboard'
      path: '/leaderboard'
      fullPath: '/$username/leaderboard'
      preLoaderRoute: typeof UsernameLeaderboardRouteImport
      parentRoute: typeof UsernameRoute
    }
    '/$username/izin': {
      id: '/$username/izin'
      path: '/izin'
      fullPath: '/$username/izin'
      preLoaderRoute: typeof UsernameIzinRouteImport
      parentRoute: typeof UsernameRoute
    }
    '/$username/profil': {
      id: '/$username/profil'
      path: '/profil'
      fullPath: '/$username/profil'
      preLoaderRoute: typeof UsernameProfilRouteImport
      parentRoute: typeof UsernameRoute
    }
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexLazyRoute: IndexLazyRoute,
  UsernameRoute: UsernameRouteWithChildren,
  LoginRoute: LoginRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()
