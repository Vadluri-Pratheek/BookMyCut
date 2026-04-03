import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import BrandLogo from './BrandLogo';

const INTRO_SHOW_DELAY = 60;
const INTRO_REVEAL_DELAY = 620;
const INTRO_TRAVEL_DELAY = 1880;
const INTRO_COMPLETE_DELAY = 3040;

const RoleSelectionIntro = ({ targetRef, onComplete }) => {
  const brandRef = useRef(null);
  const [phase, setPhase] = useState('boot');
  const [travelVars, setTravelVars] = useState({
    '--role-intro-x': '0px',
    '--role-intro-y': '0px',
    '--role-intro-scale': '1',
  });

  useLayoutEffect(() => {
    const updateTravel = () => {
      if (!targetRef?.current || !brandRef.current) {
        return;
      }

      const introRect = brandRef.current.getBoundingClientRect();
      const targetRect = targetRef.current.getBoundingClientRect();

      if (!introRect.width || !introRect.height || !targetRect.width || !targetRect.height) {
        return;
      }

      const introCenterX = window.innerWidth / 2;
      const introCenterY = window.innerHeight / 2;
      const targetCenterX = targetRect.left + (targetRect.width / 2);
      const targetCenterY = targetRect.top + (targetRect.height / 2);
      const widthScale = targetRect.width / introRect.width;
      const heightScale = targetRect.height / introRect.height;

      setTravelVars({
        '--role-intro-x': `${targetCenterX - introCenterX}px`,
        '--role-intro-y': `${targetCenterY - introCenterY}px`,
        '--role-intro-scale': `${Math.min(widthScale, heightScale)}`,
      });
    };

    const frameId = window.requestAnimationFrame(updateTravel);
    window.addEventListener('resize', updateTravel);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateTravel);
    };
  }, [targetRef]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      onComplete?.();
      return undefined;
    }

    const showTimer = window.setTimeout(() => setPhase('visible'), INTRO_SHOW_DELAY);
    const revealTimer = window.setTimeout(() => setPhase('reveal'), INTRO_REVEAL_DELAY);
    const travelTimer = window.setTimeout(() => setPhase('travel'), INTRO_TRAVEL_DELAY);
    const doneTimer = window.setTimeout(() => {
      setPhase('done');
      onComplete?.();
    }, INTRO_COMPLETE_DELAY);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(revealTimer);
      window.clearTimeout(travelTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onComplete]);

  if (phase === 'done') {
    return null;
  }

  return (
    <div className={`role-intro-overlay role-intro-overlay--${phase}`}>
      <div className="role-intro-overlay__wash" />
      <div className="role-intro-overlay__glow role-intro-overlay__glow--teal" />
      <div className="role-intro-overlay__glow role-intro-overlay__glow--orange" />

      <div
        ref={brandRef}
        className={`role-intro-brand role-intro-brand--${phase}`}
        style={travelVars}
      >
        <div className="role-intro-brand__halo" />
        <BrandLogo
          size={132}
          gap={18}
          textStyle={{
            fontSize: 'clamp(3rem, 8vw, 4.5rem)',
            letterSpacing: '-0.06em',
          }}
          markClassName="role-intro-brand__mark"
          wordmarkClassName="role-intro-brand__wordmark"
          containerStyle={{ position: 'relative', zIndex: 2 }}
        />
      </div>
    </div>
  );
};

export default RoleSelectionIntro;
