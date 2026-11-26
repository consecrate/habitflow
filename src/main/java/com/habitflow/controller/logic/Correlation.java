package com.habitflow.controller.logic;

/** Pearson correlation coefficient. */
public final class Correlation {
    private Correlation() { }

    /** Returns NaN when there are fewer than 3 pairs or one side never varies. */
    public static double pearson(double[] x, double[] y) {
        if (x.length != y.length) throw new IllegalArgumentException("Arrays must have the same length");
        int n = x.length;
        if (n < 3) return Double.NaN;
        double mx = 0, my = 0;
        for (int i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
        mx /= n;
        my /= n;
        double sxy = 0, sxx = 0, syy = 0;
        for (int i = 0; i < n; i++) {
            double dx = x[i] - mx, dy = y[i] - my;
            sxy += dx * dy;
            sxx += dx * dx;
            syy += dy * dy;
        }
        if (sxx == 0 || syy == 0) return Double.NaN;
        return sxy / Math.sqrt(sxx * syy);
    }
}
