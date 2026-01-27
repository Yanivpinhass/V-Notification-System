import React, { useEffect, useState, useRef } from 'react';
import { MenuItem } from './types';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';

interface SubNavigationProps {
  currentActiveItem: MenuItem | undefined;
  activeSubItem: string;
  setActiveSubItem: (subItemId: string) => void;
  sidebarCollapsed: boolean;
  isMobile?: boolean;
}

export const SubNavigation: React.FC<SubNavigationProps> = ({
  currentActiveItem,
  activeSubItem,
  setActiveSubItem,
  sidebarCollapsed,
  isMobile = false,
}) => {
  const [needsCarousel, setNeedsCarousel] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && contentRef.current) {
        const containerStyle = getComputedStyle(containerRef.current);
        const containerPaddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
        const containerPaddingRight = parseFloat(containerStyle.paddingRight) || 0;
        const availableWidth = containerRef.current.clientWidth - containerPaddingLeft - containerPaddingRight;

        const originalDisplay = contentRef.current.style.display;
        const originalVisibility = contentRef.current.style.visibility;
        const originalPosition = contentRef.current.style.position;

        contentRef.current.style.display = 'flex';
        contentRef.current.style.visibility = 'hidden';
        contentRef.current.style.position = 'absolute';
        contentRef.current.style.top = '-9999px';
        contentRef.current.style.left = '-9999px';
        contentRef.current.style.width = 'auto';

        contentRef.current.offsetHeight;
        const contentWidth = contentRef.current.scrollWidth;

        contentRef.current.style.display = originalDisplay;
        contentRef.current.style.visibility = originalVisibility;
        contentRef.current.style.position = originalPosition;
        contentRef.current.style.top = '';
        contentRef.current.style.left = '';
        contentRef.current.style.width = '';

        const bufferSpace = 100;
        const actuallyNeedsScrolling = contentWidth > (availableWidth - bufferSpace);

        setNeedsCarousel(actuallyNeedsScrolling);
      }
    };

    checkOverflow();
    const timeoutId1 = setTimeout(checkOverflow, 50);
    const timeoutId2 = setTimeout(checkOverflow, 150);
    const timeoutId3 = setTimeout(checkOverflow, 300);

    window.addEventListener('resize', checkOverflow);
    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
      window.removeEventListener('resize', checkOverflow);
    };
  }, [currentActiveItem?.subItems, isMobile]);

  return (
    <div className="sticky top-0 z-20 flex items-center border-b border-border flex-shrink-0 tab-container">
      {currentActiveItem?.subItems ? (
        <div ref={containerRef} className="w-full">
          {needsCarousel ? (
            <Carousel className="w-full max-w-full" opts={{ align: "start", loop: false }}>
              <div className="flex items-center">
                <CarouselPrevious className={`relative left-2 translate-y-0 border border-border/50 bg-background/80 hover:bg-muted shadow-md ${
                  isMobile ? 'h-8 w-8' : 'h-10 w-10'
                }`} />
                <CarouselContent className="-ml-1 overflow-hidden">
                  {currentActiveItem.subItems.map((subItem) => (
                    <CarouselItem key={subItem.id} className="pl-1 basis-auto">
                      <button
                        onClick={() => setActiveSubItem(subItem.id)}
                        className={`tab-item text-xs md:text-sm whitespace-nowrap ${
                          activeSubItem === subItem.id ? 'selected' : ''
                        }`}
                      >
                        {subItem.title}
                      </button>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselNext className={`relative right-2 translate-y-0 border border-border/50 bg-background/80 hover:bg-muted shadow-md ${
                  isMobile ? 'h-8 w-8' : 'h-10 w-10'
                }`} />
              </div>
            </Carousel>
          ) : (
            <nav ref={contentRef} className="flex">
              {currentActiveItem.subItems.map((subItem) => (
                <button
                  key={subItem.id}
                  onClick={() => setActiveSubItem(subItem.id)}
                  className={`tab-item text-xs md:text-sm whitespace-nowrap ${
                    activeSubItem === subItem.id ? 'selected' : ''
                  }`}
                >
                  {subItem.title}
                </button>
              ))}
            </nav>
          )}
        </div>
      ) : (
        <div className="text-xs md:text-sm text-muted-foreground px-4 md:px-6 py-4">
          {sidebarCollapsed && !isMobile ? '' : 'בחר פריט מהתפריט'}
        </div>
      )}
    </div>
  );
};
