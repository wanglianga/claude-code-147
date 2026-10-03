import React, { useEffect, useState } from 'react';
import { Button, Card, Col, DatePicker, InputNumber, Row, Space, Statistic, Table, Tag, message } from 'antd';
import dayjs from 'dayjs';
import api from '../api';

export default function Breakfast() {
  const [date, setDate] = useState(dayjs('2026-10-04'));
  const [plan, setPlan] = useState(null);
  const [prepared, setPrepared] = useState(0);
  const [records, setRecords] = useState([]);

  const load = async (d = date) => {
    const [p, r] = await Promise.all([
      api.get('/breakfast/plan', { params: { date: d.format('YYYY-MM-DD') } }),
      api.get('/breakfast/records'),
    ]);
    setPlan(p);
    setPrepared(p.prepared || p.required);
    setRecords(r);
  };
  useEffect(() => { load(); }, []);

  const confirm = async () => {
    await api.post('/breakfast/confirm', { date: plan.date, prepared });
    message.success(prepared >= plan.required ? '备餐量已确认' : '备餐不足，已记录早餐供应不足事件');
    load();
  };

  if (!plan) return <Card loading />;
  const shortage = plan.required - prepared;

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <DatePicker value={date} allowClear={false} onChange={(d) => { setDate(d); load(d); }} />
          <span style={{ color: '#888' }}>供应时段 {plan.supplyWindow}；按在住人数与忌口自动汇总需求</span>
        </Space>
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="备餐量确认">
            <Row gutter={16}>
              <Col span={12}><Statistic title="需求份数" value={plan.required} /></Col>
              <Col span={12}>
                <Statistic title="当前状态" value={{ planned: '待确认', confirmed: '已确认', shortage: '供应不足' }[plan.status]}
                  valueStyle={{ color: plan.status === 'shortage' ? '#cf1322' : '#2f6b4f', fontSize: 24 }} />
              </Col>
            </Row>
            <div style={{ margin: '16px 0' }}>
              <InputNumber style={{ width: '100%' }} min={0} value={prepared} addonBefore="实际备餐份数"
                onChange={(v) => setPrepared(v)} />
            </div>
            {shortage > 0 && <div style={{ color: '#cf1322', marginBottom: 8 }}>⚠ 缺口 {shortage} 份，确认后将生成早餐不足事件</div>}
            <Button type="primary" block onClick={confirm}>确认备餐量</Button>
          </Card>
          <Card title="忌口汇总" style={{ marginTop: 16 }}>
            {plan.dietary.length ? plan.dietary.map((d, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <Tag color="orange">{d.notes}</Tag>{d.guest}（{d.room}房 · {d.portions}份）
              </div>
            )) : '今日无特殊忌口'}
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card title={`${plan.date} 用餐名单（${plan.bookings.length} 间）`} style={{ marginBottom: 16 }}>
            <Table dataSource={plan.bookings} rowKey="code" size="small" pagination={false} columns={[
              { title: '订单', dataIndex: 'code', width: 100 },
              { title: '客人', dataIndex: 'guest' },
              { title: '房间', dataIndex: 'room', width: 80 },
              { title: '份数', dataIndex: 'portions', width: 70 },
              { title: '忌口', dataIndex: 'dietary', render: (v) => v ? <Tag color="orange">{v}</Tag> : '-' },
            ]} />
          </Card>
          <Card title="历史备餐记录">
            <Table dataSource={records} rowKey="id" size="small" pagination={false} columns={[
              { title: '日期', dataIndex: 'date' },
              { title: '需求', dataIndex: 'requiredPortions', width: 80 },
              { title: '实备', dataIndex: 'preparedPortions', width: 80 },
              { title: '状态', dataIndex: 'status', width: 100, render: (v) => <Tag color={v === 'shortage' ? 'red' : v === 'confirmed' ? 'green' : 'default'}>{{ planned: '待确认', confirmed: '已确认', shortage: '供应不足' }[v]}</Tag> },
              { title: '备注', dataIndex: 'note' },
            ]} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
