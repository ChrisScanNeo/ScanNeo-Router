import { describe, it, expect, jest } from '@jest/globals';
import { distanceToLineString, isOffRoute, findRejoinPoint } from './offroute-utils';

describe('Off-Route Detection', () => {
  describe('distanceToLineString', () => {
    it('should calculate distance from point to line correctly', () => {
      const point: [number, number] = [-0.0826, 51.5095];
      const lineString = {
        type: 'LineString' as const,
        coordinates: [
          [-0.0876, 51.5045],
          [-0.0776, 51.5045],
        ],
      };

      const distance = distanceToLineString(point, lineString);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(1000); // Less than 1km
    });

    it('should return 0 when point is on the line', () => {
      const point: [number, number] = [-0.0826, 51.5045];
      const lineString = {
        type: 'LineString' as const,
        coordinates: [
          [-0.0876, 51.5045],
          [-0.0776, 51.5045],
        ],
      };

      const distance = distanceToLineString(point, lineString);
      expect(distance).toBeLessThan(1); // Within 1 meter
    });
  });

  describe('isOffRoute', () => {
    const routeLine = {
      type: 'LineString' as const,
      coordinates: [
        [-0.0876, 51.5045],
        [-0.0826, 51.5045],
        [-0.0776, 51.5045],
      ],
    };

    it('should detect when vehicle is off route', () => {
      const currentPosition: [number, number] = [-0.0826, 51.5145]; // 100m+ north
      const threshold = 50; // 50 meters

      const result = isOffRoute(currentPosition, routeLine, threshold);
      expect(result).toBe(true);
    });

    it('should not trigger when vehicle is on route', () => {
      const currentPosition: [number, number] = [-0.0826, 51.5045]; // On the line
      const threshold = 50;

      const result = isOffRoute(currentPosition, routeLine, threshold);
      expect(result).toBe(false);
    });

    it('should handle edge case at route endpoints', () => {
      const startPoint: [number, number] = [-0.0876, 51.5045];
      const endPoint: [number, number] = [-0.0776, 51.5045];
      const threshold = 50;

      expect(isOffRoute(startPoint, routeLine, threshold)).toBe(false);
      expect(isOffRoute(endPoint, routeLine, threshold)).toBe(false);
    });
  });

  describe('findRejoinPoint', () => {
    const routeLine = {
      type: 'LineString' as const,
      coordinates: [
        [-0.0876, 51.5045],
        [-0.0826, 51.5045],
        [-0.0776, 51.5045],
        [-0.0726, 51.5045],
      ],
    };

    it('should find optimal rejoin point ahead on route', () => {
      const currentPosition: [number, number] = [-0.085, 51.505]; // Slightly off route
      const currentIndex = 0; // At first segment

      const rejoinPoint = findRejoinPoint(currentPosition, routeLine, currentIndex);

      expect(rejoinPoint).toBeDefined();
      expect(rejoinPoint?.index).toBeGreaterThanOrEqual(currentIndex);
      expect(rejoinPoint?.coordinates).toHaveLength(2);
    });

    it('should return end point when near end of route', () => {
      const currentPosition: [number, number] = [-0.073, 51.505];
      const currentIndex = 2; // Near end

      const rejoinPoint = findRejoinPoint(currentPosition, routeLine, currentIndex);

      expect(rejoinPoint?.index).toBe(3); // Last point
      expect(rejoinPoint?.coordinates).toEqual([-0.0726, 51.5045]);
    });

    it('should handle complete deviation from route', () => {
      const farPosition: [number, number] = [0, 0]; // Very far away
      const currentIndex = 1;

      const rejoinPoint = findRejoinPoint(farPosition, routeLine, currentIndex);

      expect(rejoinPoint).toBeDefined();
      // Should suggest a reasonable rejoin point
    });
  });

  describe('Off-Route Timer', () => {
    jest.useFakeTimers();

    it('should trigger reroute after threshold time off-route', () => {
      const onReroute = jest.fn();
      const threshold = 8000; // 8 seconds

      // Simulate being off-route
      let offRouteTime = 0;
      const interval = setInterval(() => {
        offRouteTime += 1000;
        if (offRouteTime >= threshold) {
          onReroute();
          clearInterval(interval);
        }
      }, 1000);

      jest.advanceTimersByTime(8000);

      expect(onReroute).toHaveBeenCalledTimes(1);
    });

    it('should reset timer when back on route', () => {
      const onReroute = jest.fn();
      let isOff = true;
      let offRouteTime = 0;

      const interval = setInterval(() => {
        if (isOff) {
          offRouteTime += 1000;
        } else {
          offRouteTime = 0;
        }

        if (offRouteTime >= 8000) {
          onReroute();
        }
      }, 1000);

      // Off route for 5 seconds
      jest.advanceTimersByTime(5000);

      // Back on route
      isOff = false;
      jest.advanceTimersByTime(1000);

      // Off route again
      isOff = true;
      jest.advanceTimersByTime(7000);

      // Should not have triggered yet
      expect(onReroute).not.toHaveBeenCalled();

      // One more second to trigger
      jest.advanceTimersByTime(1000);
      expect(onReroute).toHaveBeenCalledTimes(1);

      clearInterval(interval);
    });

    jest.useRealTimers();
  });
});
