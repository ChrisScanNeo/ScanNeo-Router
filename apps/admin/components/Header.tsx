'use client';

import Link from 'next/link';
import Image from 'next/image';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  backHref?: string;
  status?: 'online' | 'offline' | 'processing';
}

export function Header({
  title,
  subtitle = '',
  showBackButton = true,
  backHref = '/',
  status = 'online',
}: HeaderProps) {
  const statusColors = {
    online: 'bg-[#00B140]',
    offline: 'bg-red-500',
    processing: 'bg-[#A6CE39]',
  };

  return (
    <header className="bg-white shadow-sm border-b border-[#1C2F38]/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Left section - Back button and title */}
          <div className="flex items-center flex-1">
            {showBackButton && (
              <Link
                href={backHref}
                className="text-[#4C4FA3] hover:text-[#00B140] transition-colors mr-4"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
              </Link>
            )}
            <div>
              <h1 className="text-2xl font-bold text-[#4C4FA3]">{title}</h1>
              {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
            </div>
          </div>

          {/* Center section - Logo */}
          <div className="flex-shrink-0 mx-8">
            <Image
              src="/scanneo-logo.svg"
              alt="ScanNeo"
              width={150}
              height={40}
              className="h-10 w-auto"
              priority
            />
          </div>

          {/* Right section - Status */}
          <div className="flex items-center justify-end flex-1">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">System Status</span>
              <div className={`w-2 h-2 ${statusColors[status]} rounded-full animate-pulse`} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
