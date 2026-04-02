import { useState, useCallback, useEffect, useRef } from "react";
import { motion, useMotionValue, useAnimationFrame, useTransform } from "motion/react";
import styles from "./GradientText.module.css";

export default function GradientText({
  children,
  className = "",
  colors = ["#5227FF", "#FF9FFC", "#B19EEF"],
  animationSpeed = 8,
  gradientScale = 300,
  textWeight = 400,
  showBorder = false,
  direction = "horizontal",
  pauseOnHover = false,
  yoyo = true,
  inline = true,
  ...props
}) {
  const [isPaused, setIsPaused] = useState(false);
  const progress = useMotionValue(0);
  const elapsedRef = useRef(0);
  const lastTimeRef = useRef(null);

  const animationDuration = animationSpeed * 1000;

  useAnimationFrame((time) => {
    if (isPaused) {
      lastTimeRef.current = null;
      return;
    }

    if (lastTimeRef.current === null) {
      lastTimeRef.current = time;
      return;
    }

    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;
    elapsedRef.current += deltaTime;

    if (yoyo) {
      const fullCycle = animationDuration * 2;
      const cycleTime = elapsedRef.current % fullCycle;

      if (cycleTime < animationDuration) {
        progress.set((cycleTime / animationDuration) * 100);
      } else {
        progress.set(100 - ((cycleTime - animationDuration) / animationDuration) * 100);
      }
    } else {
      progress.set((elapsedRef.current / animationDuration) * 100);
    }
  });

  useEffect(() => {
    elapsedRef.current = 0;
    progress.set(0);
  }, [animationSpeed, progress, yoyo]);

  const backgroundPosition = useTransform(progress, (p) => {
    if (direction === "horizontal") {
      return `${p}% 50%`;
    } else if (direction === "vertical") {
      return `50% ${p}%`;
    } else {
      return `${p}% 50%`;
    }
  });

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) setIsPaused(true);
  }, [pauseOnHover]);

  const handleMouseLeave = useCallback(() => {
    if (pauseOnHover) setIsPaused(false);
  }, [pauseOnHover]);

  const gradientAngle =
    direction === "horizontal" ? "to right" : direction === "vertical" ? "to bottom" : "to bottom right";
  const gradientColors = [...colors, colors[0]].join(", ");

  const gradientStyle = {
    backgroundImage: `linear-gradient(${gradientAngle}, ${gradientColors})`,
    backgroundSize:
      direction === "horizontal"
        ? `${gradientScale}% 100%`
        : direction === "vertical"
          ? `100% ${gradientScale}%`
          : `${gradientScale}% ${gradientScale}%`,
    backgroundRepeat: "repeat"
  };

  const rootClassName = [
    styles.root,
    showBorder ? styles.withBorder : "",
    inline ? styles.inline : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  const RootTag = inline ? motion.span : motion.div;

  return (
    <RootTag
      className={rootClassName}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {showBorder ? <motion.span className={styles.gradientOverlay} style={{ ...gradientStyle, backgroundPosition }} /> : null}
      <motion.span className={styles.textContent} style={{ ...gradientStyle, backgroundPosition, fontWeight: textWeight }}>
        {children}
      </motion.span>
    </RootTag>
  );
}

