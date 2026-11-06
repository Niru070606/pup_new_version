import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="page mt-16 max-w-xl text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-3">The page you requested does not exist.</p>
      <p className="mt-6"><Link to="/" className="btn btn-primary">Go to the home page</Link></p>
    </div>
  );
}
