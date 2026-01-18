'use client';

import { Icon } from '@iconify/react';
import Link from 'next/link';

export default function Navbar() {
  return (
    <div className='sticky top-0 z-50 w-full bg-base-100 '>
      <div className='mx-auto max-w-[1440px] px-6 border-b border-base-content/5'>
        <nav className='navbar bg-transparent'>
          <div className='flex-1 flex items-center gap-2'>
            <Link
              href='/'
              className='flex items-center gap-2 transition-opacity'
            >
              <div className='w-10 h-10 bg-base-300 rounded-lg flex items-center justify-center'>
                <span className='text-xs'>logo</span>
              </div>
              <span className='text-xl font-bold text-base-content'>
                kusako
              </span>
            </Link>
          </div>

          <div className='flex-none flex items-center gap-2'>
            <div className='hidden lg:flex gap-2'>
              <Link
                className='px-3 py-2 text-base-content/70 hover:text-base-content cursor-pointer transition-colors'
                href='#'
              >
                docs
              </Link>
              <Link
                className='px-3 py-2 text-base-content/70 hover:text-base-content cursor-pointer transition-colors'
                href='#'
              >
                status
              </Link>

              <div className='dropdown dropdown-end'>
                <div
                  tabIndex={0}
                  role='button'
                  className='px-3 py-2 text-base-content/70 hover:text-base-content transition-colors cursor-pointer flex items-center gap-1'
                >
                  support
                  <Icon
                    icon='material-symbols:keyboard-arrow-down-rounded'
                    className='w-4 h-4'
                  />
                </div>
                <ul
                  tabIndex={0}
                  className='menu dropdown-content bg-base-200 rounded-box z-1 mt-3 w-38 p-2 shadow'
                >
                  <li>
                    <Link
                      className='flex justify-between items-center hover:text-primary hover:bg-transparent transition-colors'
                      href='#'
                    >
                      FAQ
                      <Icon icon='ri:arrow-right-s-line' className='h-4 w-4' />
                    </Link>
                  </li>
                  <li>
                    <Link
                      className='flex justify-between items-center hover:text-primary hover:bg-transparent transition-colors'
                      href='#'
                    >
                      guides
                      <Icon icon='ri:arrow-right-s-line' className='h-4 w-4' />
                    </Link>
                  </li>
                  <li>
                    <Link
                      className='flex justify-between items-center hover:text-primary hover:bg-transparent transition-colors'
                      href='#'
                    >
                      sako discord
                      <Icon icon='ri:external-link-line' className='w-4 h-4' />
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            <div className='divider divider-horizontal mx-0 h-4 self-center opacity-30'></div>

            <Link className='btn btn-accent shadow-none' href='#'>
              <span className='font-bold'>kusako stage</span>
            </Link>

            <label className='swap swap-rotate p-2 hover:bg-base-200 rounded-lg transition-colors cursor-pointer'>
              <input type='checkbox' />
              <Icon
                icon='material-symbols:dark-mode-outline'
                className='swap-off h-6 w-6'
              />
              <Icon
                icon='material-symbols:sunny-outline'
                className='swap-on h-6 w-6'
              />
            </label>

            <div className='divider divider-horizontal mx-0 h-4 self-center opacity-30'></div>

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
      </div>
    </div>
  );
}
