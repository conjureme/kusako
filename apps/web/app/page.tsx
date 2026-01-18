import Navbar from '../components/navbar';
import Link from 'next/link';

export default function Page() {
  return (
    <>
      <Navbar />
      <main className='flex min-h-screen items-center justify-center'>
        <Link href='/settings' className='btn btn-primary'>
          go to settings
        </Link>
      </main>
    </>
  );
}
