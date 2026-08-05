// Financial functions matching Excel behavior within 1e-6 tolerance

export function NPV(rate: number, ...cashFlows: number[]): number {
  return cashFlows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rate, i + 1), 0);
}

export function IRR(cashFlows: number[], guess = 0.1, maxIter = 100, tol = 1e-7): number | string {
  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let j = 0; j < cashFlows.length; j++) {
      const denom = Math.pow(1 + rate, j);
      npv += cashFlows[j] / denom;
      dnpv -= j * cashFlows[j] / Math.pow(1 + rate, j + 1);
    }
    if (Math.abs(dnpv) < 1e-15) return '#NUM!';
    const newRate = rate - npv / dnpv;
    if (Math.abs(newRate - rate) < tol) return newRate;
    rate = newRate;
  }
  return '#NUM!';
}

export function XNPV(rate: number, cashFlows: number[], dates: number[]): number | string {
  if (cashFlows.length !== dates.length || cashFlows.length === 0) return '#VALUE!';
  const d0 = dates[0];
  return cashFlows.reduce((acc, cf, i) => {
    const years = (dates[i] - d0) / 365;
    return acc + cf / Math.pow(1 + rate, years);
  }, 0);
}

export function XIRR(cashFlows: number[], dates: number[], guess = 0.1, maxIter = 100, tol = 1e-7): number | string {
  if (cashFlows.length !== dates.length || cashFlows.length === 0) return '#VALUE!';
  const d0 = dates[0];
  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let j = 0; j < cashFlows.length; j++) {
      const years = (dates[j] - d0) / 365;
      npv += cashFlows[j] / Math.pow(1 + rate, years);
      dnpv -= years * cashFlows[j] / Math.pow(1 + rate, years + 1);
    }
    if (Math.abs(dnpv) < 1e-15) return '#NUM!';
    const newRate = rate - npv / dnpv;
    if (Math.abs(newRate - rate) < tol) return newRate;
    rate = newRate;
  }
  return '#NUM!';
}

export function PMT(rate: number, nper: number, pv: number, fv = 0, type = 0): number {
  if (rate === 0) return -(pv + fv) / nper;
  const pvif = Math.pow(1 + rate, nper);
  const pmt = rate * (pv * pvif + fv) / ((1 + rate * type) * (pvif - 1));
  return -pmt;
}

export function PV(rate: number, nper: number, pmt: number, fv = 0, type = 0): number {
  if (rate === 0) return -(pmt * nper + fv);
  const pvif = Math.pow(1 + rate, nper);
  return -(pmt * (1 + rate * type) * (pvif - 1) / (rate * pvif) + fv / pvif);
}

export function FV(rate: number, nper: number, pmt: number, pv = 0, type = 0): number {
  if (rate === 0) return -(pv + pmt * nper);
  const pvif = Math.pow(1 + rate, nper);
  return -(pv * pvif + pmt * (1 + rate * type) * (pvif - 1) / rate);
}

export function RATE(nper: number, pmt: number, pv: number, fv = 0, type = 0, guess = 0.1, maxIter = 100, tol = 1e-7): number | string {
  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    const pvif = Math.pow(1 + rate, nper);
    const y = pv * pvif + pmt * (1 + rate * type) * (pvif - 1) / rate + fv;
    const dy = nper * pv * Math.pow(1 + rate, nper - 1)
      + pmt * (1 + rate * type) * (nper * Math.pow(1 + rate, nper - 1) * rate - (pvif - 1)) / (rate * rate)
      + pmt * type * (pvif - 1) / rate;
    if (Math.abs(dy) < 1e-15) return '#NUM!';
    const newRate = rate - y / dy;
    if (Math.abs(newRate - rate) < tol) return newRate;
    rate = newRate;
  }
  return '#NUM!';
}

export function NPER(rate: number, pmt: number, pv: number, fv = 0, type = 0): number | string {
  if (rate === 0) return -(pv + fv) / pmt;
  const num = pmt * (1 + rate * type) - fv * rate;
  const den = pv * rate + pmt * (1 + rate * type);
  if (num / den <= 0) return '#NUM!';
  return Math.log(num / den) / Math.log(1 + rate);
}
