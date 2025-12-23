'use client';

import { useState } from 'react';
import { Icon } from '@iconify/react';

import Link from 'next/link';

export default function Navbar() {
  const [theme, setTheme] = useState<'sako-dark' | 'sako-light'>('sako-dark');

  const toggleTheme = () => {
    const newTheme = theme === 'sako-dark' ? 'sako-light' : 'sako-dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <nav className='navbar bg-transparent px-4'>
      <div className='flex-1 flex items-center gap-2'>
        <Link
          href='/'
          className='flex items-center gap-2 hover:opacity-80 transition-opacity'
        >
          <div className='w-10 h-10 bg-base-300 rounded-lg flex items-center justify-center'>
            <span className='text-xs'>logo</span>
          </div>
          <span className='text-xl font-bold text-base-content'>kusako</span>
        </Link>
      </div>

      <div className='flex-none flex items-center gap-2'>
        <div className='hidden lg:flex gap-2'>
          <div className='dropdown dropdown-end'>
            <div
              tabIndex={0}
              role='button'
              className='px-3 py-2 text-base-content/70 hover:text-base-content transition-colors cursor-pointer flex items-center gap-1'
            >
              dropdown
              <Icon
                icon='material-symbols:keyboard-arrow-down-rounded'
                className='w-4 h-4'
              />
            </div>
            <ul
              tabIndex={0}
              className='menu dropdown-content bg-base-200 rounded-box z-1 mt-3 w-52 p-2 shadow'
            >
              <li>
                <a className='hover:text-primary hover:bg-transparent transition-colors'>
                  item 1
                </a>
              </li>
              <li>
                <a className='hover:text-primary hover:bg-transparent transition-colors'>
                  item 2
                </a>
              </li>
              <li>
                <a className='hover:text-primary hover:bg-transparent transition-colors'>
                  item 3
                </a>
              </li>
            </ul>
          </div>
          <a className='px-3 py-2 text-base-content/70 hover:text-base-content cursor-pointer transition-colors'>
            docs
          </a>
          <a className='px-3 py-2 text-base-content/70 hover:text-base-content cursor-pointer transition-colors'>
            link
          </a>
        </div>

        <div className='divider divider-horizontal mx-0'></div>

        <button className='btn btn-accent'>button</button>

        <div className='divider divider-horizontal mx-0'></div>

        <label className='swap swap-rotate p-2 hover:bg-base-200 rounded-lg transition-colors cursor-pointer'>
          <input
            type='checkbox'
            onChange={toggleTheme}
            checked={theme === 'sako-light'}
          />
          <Icon
            icon='material-symbols:dark-mode-outline'
            className='swap-off h-6 w-6'
          />
          <Icon
            icon='material-symbols:sunny-outline'
            className='swap-on h-6 w-6'
          />
        </label>

        <Link
          href='#'
          target='_blank'
          rel='noopener noreferrer'
          className='p-2 text-base-content/70 hover:text-base-content hover:bg-base-200 rounded-lg transition-colors'
        >
          <Icon icon='ic:baseline-discord' className='h-6 w-6' />
        </Link>

        <Link
          href='#'
          target='_blank'
          rel='noopener noreferrer'
          className='p-2 text-base-content/70 hover:text-base-content hover:bg-base-200 rounded-lg transition-colors'
        >
          <Icon icon='mdi:github' className='h-6 w-6' />
        </Link>
      </div>
    </nav>
  );
}
