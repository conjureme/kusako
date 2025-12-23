import Navbar from '../components/Navbar';

export default function Page() {
  return (
    <div className='min-h-screen bg-base-100'>
      <Navbar />
      <main className='flex flex-col items-center justify-between min-h-screen p-24'>
        <h1 className='text-primary'>hi</h1>
      </main>
    </div>
  );
}
