import { lazy, Suspense } from 'react'
import { Route, Switch } from 'wouter'
import { Loading, WorldRoot } from './app/WorldRoot'
import { useSim } from './world/store'
import { CommandPalette } from './app/CommandPalette'

const Landing = lazy(() => import('./pages/Landing'))
const Twin = lazy(() => import('./surfaces/Twin'))
const Ops = lazy(() => import('./surfaces/Ops'))
const Drive = lazy(() => import('./surfaces/Drive'))
const CarScreen = lazy(() => import('./surfaces/CarScreen'))
const PhoneApp = lazy(() => import('./surfaces/PhoneApp'))
const Director = lazy(() => import('./surfaces/Director'))

function Ready({ children }: { children: React.ReactNode }) {
  const world = useSim((s) => s.world)
  return world ? <>{children}</> : <Loading />
}

export default function App() {
  return (
    <WorldRoot>
      <Suspense fallback={<Loading label="Loading surface" />}>
        <Ready>
          <Switch>
            <Route path="/" component={Landing} />
            <Route path="/twin" component={Twin} />
            <Route path="/ops" component={Ops} />
            <Route path="/drive" component={Drive} />
            <Route path="/car" component={CarScreen} />
            <Route path="/app" component={PhoneApp} />
            <Route path="/director" component={Director} />
            <Route>
              <Loading label="No surface at this address. Press 0 for the showcase." />
            </Route>
          </Switch>
          <CommandPalette />
        </Ready>
      </Suspense>
    </WorldRoot>
  )
}
