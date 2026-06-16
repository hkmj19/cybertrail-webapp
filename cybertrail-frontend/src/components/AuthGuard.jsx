// src/components/AuthGuard.jsx
// Redirects to /login if not authenticated
import { Navigate, useLocation } from 'react-router-dom'
import useStore from '../store/useStore'

export default function AuthGuard({ children, requiredRoles }) {
  const { accessToken, user } = useStore()
  const location = useLocation()

  if (!accessToken || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requiredRoles && !requiredRoles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-ct-red font-mono text-sm">Access Denied</p>
          <p className="text-ct-muted font-mono text-xs mt-1">
            Requires role: {requiredRoles.join(' or ')}
          </p>
        </div>
      </div>
    )
  }

  return children
}