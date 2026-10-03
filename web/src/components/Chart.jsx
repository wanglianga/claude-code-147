import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export default function Chart({ option, height = 300 }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = echarts.init(ref.current);
    const onResize = () => chartRef.current && chartRef.current.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chartRef.current && chartRef.current.dispose(); };
  }, []);
  useEffect(() => {
    if (chartRef.current && option) chartRef.current.setOption(option, true);
  }, [option]);
  return <div ref={ref} style={{ width: '100%', height }} />;
}
