/* eslint-disable */

import { createFileRoute } from '@tanstack/react-router'

import { Route as rootRouteImport } from './routes/__root'
import { Route as LoginRouteImport } from './routes/login'
import { Route as AttendanceRouteImport } from './routes/attendance'
import { Route as UsernameRouteImport } from './routes/$username'

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

export interface FileRoutesByFullPath {
  '/': typeof IndexLazyRoute
  '/attendance': typeof AttendanceRoute
  '/$username': typeof UsernameRoute
  '/login': typeof LoginRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexLazyRoute
  '/attendance': typeof AttendanceRoute
  '/$username': typeof UsernameRoute
  '/login': typeof LoginRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexLazyRoute
  '/attendance': typeof AttendanceRoute
  '/$username': typeof UsernameRoute
  '/login': typeof LoginRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/attendance' | '/$username' | '/login'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/attendance' | '/$username' | '/login'
  id: '__root__' | '/' | '/attendance' | '/$username' | '/login'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexLazyRoute: typeof IndexLazyRoute
  AttendanceRoute: typeof AttendanceRoute
  UsernameRoute: typeof UsernameRoute
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
  UsernameRoute: UsernameRoute,
  LoginRoute: LoginRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()
