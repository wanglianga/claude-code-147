import React, { useEffect, useState } from 'react';
import { Card, DatePicker, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import api, { ROOM_STATUS } from '../api';

const CELL_STYLE = {
  free: { background: '#f6ffed', color: '#389e0d' },
  booked: { background: '#e6f4ff', color: '#0958d9' },
  inhouse: { background: '#fff7e6', color: '#d46b08' },
};

export default function CalendarPage() {
  const [from, setFrom] = useState(dayjs('2026-10-01'));
  const [data, setData] = useState(null);
  const [inventory, setInventory] = useState([]);

  const load = async (f = from) => {
    const to = f.add(13, 'day').format('YYYY-MM-DD');
    const [cal, inv] = await Promise.all([
      api.get('/calendar', { params: { from: f.format('YYYY-MM-DD'), to } }),
      api.get('/inventory', { params: { from: f.format('YYYY-MM-DD'), to } }),
    ]);
    setData(cal);
    setInventory(inv);
  };
  useEffect(() => { load(); }, []);

  if (!data) return <Card loading />;

  const columns = [
    { title: '房间', dataIndex: 'code', fixed: 'left', width: 110,
      render: (_, r) => (
        <div>
          <b>{r.code}</b> <span style={{ color: '#888', fontSize: 12 }}>{r.type}</span>
          <div><Tag color={ROOM_STATUS[r.status]?.color} style={{ marginTop: 2 }}>{ROOM_STATUS[r.status]?.text}</Tag></div>
        </div>
      ) },
    ...data.dates.map((d) => ({
      title: d.slice(5), dataIndex: d, width: 92, align: 'center',
      render: (_, r) => {
        const cell = r.cells.find((c) => c.date === d);
        const st = CELL_STYLE[cell.state];
        return (
          <Tooltip title={cell.guest ? `${cell.guest} · ${cell.channel} · ${cell.bookingCode}` : `¥${cell.price}`}>
            <div style={{ ...st, borderRadius: 4, padding: '4px 2px', fontSize: 12, lineHeight: 1.5 }}>
              {cell.guest ? <b>{cell.guest}</b> : '可售'}
              <div>¥{cell.price}</div>
            </div>
          </Tooltip>
        );
      },
    })),
  ];

  const invColumns = [
    { title: '房型', dataIndex: 'typeName', fixed: 'left', width: 130 },
    ...inventory[0].days.map((d) => ({
      title: d.date.slice(5), width: 86, align: 'center',
      render: (_, r) => {
        const cell = r.days.find((x) => x.date === d.date);
        return (
          <Tooltip title={`物理${cell.total} / 可售${cell.sellable} / 已订${cell.booked}`}>
            <span style={{ color: cell.oversold ? '#cf1322' : cell.available <= 0 ? '#d46b08' : '#389e0d', fontWeight: cell.oversold ? 700 : 400 }}>
              {cell.booked}/{cell.sellable}{cell.oversold ? ' 超卖!' : ''}
            </span>
          </Tooltip>
        );
      },
    })),
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <DatePicker value={from} onChange={(d) => { setFrom(d); load(d); }} allowClear={false} />
        <span style={{ marginLeft: 12, color: '#888' }}>房态日历：绿色可售 / 蓝色已订 / 橙色在住；下方为各房型每日 已订/可售 库存</span>
      </Card>
      <Card title="房间 × 日期" style={{ marginBottom: 16 }}>
        <Table dataSource={data.rooms} columns={columns} rowKey="id" pagination={false}
          scroll={{ x: 1300 }} size="small" bordered />
      </Card>
      <Card title="房型库存（已订/可售，红色为超卖）">
        <Table dataSource={inventory} columns={invColumns} rowKey="typeId" pagination={false}
          scroll={{ x: 1300 }} size="small" bordered />
      </Card>
    </div>
  );
}
