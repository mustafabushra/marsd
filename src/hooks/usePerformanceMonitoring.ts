import { useEffect, useRef, useCallback } from 'react';
import { performanceMonitor } from '../services/performanceMonitor';
import { analyticsTracker } from '../services/analyticsTracker';
import { errorLogger } from '../services/errorLogger';

interface UsePerformanceMonitoringOptions {
  componentName: string;
  trackMetrics?: boolean;
  trackInteractions?: boolean;
  warnOnSlowRender?: number; // milliseconds
}

export function usePerformanceMonitoring(options: UsePerformanceMonitoringOptions) {
  const { componentName, trackMetrics = true, trackInteractions = true, warnOnSlowRender = 3000 } =
    options;
  const renderStartTime = useRef<number>(0);
  const effectsCompleted = useRef<Set<string>>(new Set());

  // Track component mount
  useEffect(() => {
    renderStartTime.current = performance.now();

    analyticsTracker.trackFeature('COMPONENT', 'MOUNT', {
      component: componentName,
    });

    return () => {
      const renderDuration = performance.now() - renderStartTime.current;

      if (trackMetrics) {
        performanceMonitor.recordMetric(`Component Render - ${componentName}`, renderDuration, 'ms');
      }

      if (renderDuration > warnOnSlowRender) {
        errorLogger.logWarning(
          `Slow component render detected: ${componentName}`,
          {
            component: componentName,
            duration: renderDuration,
            threshold: warnOnSlowRender,
          },
        );

        analyticsTracker.trackPerformanceIssue(
          componentName,
          'render_time',
          renderDuration,
          warnOnSlowRender,
        );
      }

      analyticsTracker.trackFeature('COMPONENT', 'UNMOUNT', {
        component: componentName,
      });
    };
  }, [componentName, trackMetrics, warnOnSlowRender]);

  /**
   * Measure async operation
   */
  const measureAsync = useCallback(
    async <T,>(operationName: string, fn: () => Promise<T>): Promise<T> => {
      const startTime = performance.now();

      try {
        const result = await fn();
        const duration = performance.now() - startTime;

        if (trackMetrics) {
          performanceMonitor.recordMetric(`${componentName} - ${operationName}`, duration, 'ms');
        }

        if (trackInteractions) {
          analyticsTracker.trackFeature(componentName, operationName, {
            duration: Math.round(duration),
          });
        }

        return result;
      } catch (error) {
        const duration = performance.now() - startTime;

        errorLogger.logError(
          `Error in ${componentName} - ${operationName}`,
          error as Error,
          {
            component: componentName,
            operation: operationName,
            duration,
          },
        );

        throw error;
      }
    },
    [componentName, trackMetrics, trackInteractions],
  );

  /**
   * Measure sync operation
   */
  const measureSync = useCallback(
    <T,>(operationName: string, fn: () => T): T => {
      const startTime = performance.now();

      try {
        const result = fn();
        const duration = performance.now() - startTime;

        if (trackMetrics) {
          performanceMonitor.recordMetric(`${componentName} - ${operationName}`, duration, 'ms');
        }

        if (trackInteractions) {
          analyticsTracker.trackFeature(componentName, operationName, {
            duration: Math.round(duration),
          });
        }

        return result;
      } catch (error) {
        const duration = performance.now() - startTime;

        errorLogger.logError(
          `Error in ${componentName} - ${operationName}`,
          error as Error,
          {
            component: componentName,
            operation: operationName,
            duration,
          },
        );

        throw error;
      }
    },
    [componentName, trackMetrics, trackInteractions],
  );

  /**
   * Track user interaction
   */
  const trackInteraction = useCallback(
    (interactionName: string, properties?: Record<string, any>) => {
      if (trackInteractions) {
        analyticsTracker.trackInteraction(componentName, interactionName);
        analyticsTracker.trackFeature(componentName, interactionName, properties);
      }
    },
    [componentName, trackInteractions],
  );

  /**
   * Track error
   */
  const trackError = useCallback(
    (errorMsg: string, errorObj?: Error, properties?: Record<string, any>) => {
      errorLogger.logError(errorMsg, errorObj, {
        component: componentName,
        ...properties,
      });

      if (trackInteractions) {
        analyticsTracker.trackError(errorMsg, componentName, properties);
      }
    },
    [componentName, trackInteractions],
  );

  /**
   * Track effect completion
   */
  const trackEffectCompletion = useCallback(
    (effectName: string, duration?: number) => {
      if (effectsCompleted.current.has(effectName)) {
        return;
      }

      effectsCompleted.current.add(effectName);

      if (trackMetrics && duration) {
        performanceMonitor.recordMetric(`${componentName} - Effect ${effectName}`, duration, 'ms');
      }

      if (trackInteractions) {
        analyticsTracker.trackFeature(componentName, `EFFECT_${effectName}`, {
          duration,
        });
      }
    },
    [componentName, trackMetrics, trackInteractions],
  );

  return {
    measureAsync,
    measureSync,
    trackInteraction,
    trackError,
    trackEffectCompletion,
  };
}

/**
 * Hook to measure component render performance
 */
export function useMeasureRender(componentName: string) {
  const startTime = useRef<number>(0);

  useEffect(() => {
    startTime.current = performance.now();

    return () => {
      const duration = performance.now() - startTime.current;
      performanceMonitor.recordMetric(`Component Render - ${componentName}`, duration, 'ms');
    };
  }, [componentName]);
}

/**
 * Hook to track when component becomes interactive
 */
export function useInteractive(componentName: string) {
  useEffect(() => {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === componentName) {
          performanceMonitor.recordMetric(
            `Component Interactive - ${componentName}`,
            entry.duration,
            'ms',
          );
        }
      }
    });

    try {
      observer.observe({ entryTypes: ['measure'] });
    } catch (e) {
      // Browser doesn't support this
    }

    return () => {
      observer.disconnect();
    };
  }, [componentName]);
}

/**
 * Hook to debug component re-renders
 */
export function useWhyDidYouUpdate(componentName: string, props: Record<string, any>) {
  const previousProps = useRef<Record<string, any>>();

  useEffect(() => {
    if (previousProps.current) {
      const allKeys = Object.keys({ ...previousProps.current, ...props });
      const changedProps: Record<string, any> = {};

      allKeys.forEach((key) => {
        if (previousProps.current![key] !== props[key]) {
          changedProps[key] = {
            from: previousProps.current![key],
            to: props[key],
          };
        }
      });

      if (Object.keys(changedProps).length > 0) {
        if (process.env.NODE_ENV === 'development') {
          console.debug(`[${componentName}] Why did you update:`, changedProps);
        }
      }
    }

    previousProps.current = props;
  }, [componentName, props]);
}
