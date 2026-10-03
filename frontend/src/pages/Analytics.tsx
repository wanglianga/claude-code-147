import { useEffect, useState } from 'react';
import { Card, Col, DatePicker, Row, Space, Statistic, Table, Tag, Alert } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { api, fmt, n } from '../api';
import { INCIDENT_LABEL, REVIEW_CATEGORY, REVIEW_CATEGORY_COLOR } from '../labels';

export default function Analytics() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(5, 'day'), dayjs().add(2, 'day')]);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get(`/analytics/season-review?from=${range[0].format('YYYY-MM-DD')}&to=${range[1].format('YYYY-MM-DD')}`).then(setData);
  }, [range]);
  if (!data) return null;

  const maxChannel = Math.max(1, ...data.byChannel.map((c: any) => n(c.netIncome)));
  const maxType = Math.max(1, ...data.byRoomType.map((c: any) => n(c.netIncome)));
  const maxReviewCat = Math.max(1, ...Object.values(data.reviews.byCategory).map(Number));
  const incTypes = Object.keys(data.incidents.byType);
  const maxInc = Math.max(1, ...incTypes.map((t) => data.incidents.byType[t]));

  const Bar = ({ label, value, max, color, suffix }: any) => (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
      <div style={{ width: 110, fontSize: 12 }}>{label}</div>
      <div style={{ flex: 1, background: '#f0f0f0', borderRadius: 4, height: 20, position: 'relative' }}>
        <div style={{ width: `${Math.max(2, (value / max) * 100)}%`, background: color, height: '100%', borderRadius: 4, minWidth: 2 }} />
      </div>
      <div style={{ width: 130, textAlign: 'right', fontSize: 12 }}>{suffix}{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }} title={<Space>旺季经营复盘
        <DatePicker.RangePicker size="small" value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} allowClear={false} />
      </Space>}>
        <Row gutter={12}>
          <Col span={4}><Statistic title="结算订单" value={data.kpi.bookings} /></Col>
          <Col span={4}><Statistic title="入住率" value={data.kpi.occupancyRate} suffix="%" precision={1} /></Col>
          <Col span={4}><Statistic title="总营收" value={n(data.kpi.revenue)} precision={0} prefix="¥" /></Col>
          <Col span={4}><Statistic title="渠道佣金" value={n(data.kpi.commission)} precision={0} prefix="¥" valueStyle={{ color: '#8c8c8c' }} /></Col>
          <Col span={4}><Statistic title="补偿成本" value={n(data.kpi.compensationCost)} precision={0} prefix="¥" valueStyle={{ color: '#d46b08' }} /></Col>
          <Col span={4}><Statistic title="净收入" value={n(data.kpi.netIncome)} precision={0} prefix="¥" valueStyle={{ color: '#c0392b' }} /></Col>
        </Row>
      </Card>

      <Row gutter={12}>
        <Col span={12}>
          <Card size="small" style={{ marginBottom: 12 }} title="按渠道复盘利润（佣金口径已扣除）">
            {data.byChannel.map((c: any) => (
              <Bar key={c.channel} label={c.channel} max={maxChannel} value={n(c.netIncome)} color="#2f7a4d"
                suffix={`净 ${fmt(n(c.netIncome))} | `} />
            ))}
            <Table size="small" style={{ marginTop: 8 }} pagination={false} rowKey="channel" dataSource={data.byChannel}
              columns={[
                { title: '渠道', dataIndex: 'channel' },
                { title: '订单', dataIndex: 'bookings', width: 60 },
                { title: '间夜', dataIndex: 'roomNights', width: 60 },
                { title: 'ADR', dataIndex: 'adr', width: 90, render: (v: any) => fmt(v) },
                { title: '佣金', dataIndex: 'commission', width: 90, render: (v: any) => fmt(v) },
                { title: '补偿券', dataIndex: 'couponCost', width: 90, render: (v: any) => fmt(v) },
                { title: '净利率', dataIndex: 'margin', width: 80, render: (v: any) => `${v}%` },
                { title: '净收入', dataIndex: 'netIncome', render: (v: any) => <span className="money">{fmt(v)}</span> },
              ]} />
          </Card>
          <Card size="small" title="差评来源归因分布">
            {Object.entries(data.reviews.byCategory).map(([k, v]) => (
              <Bar key={k} label={REVIEW_CATEGORY[k]} max={maxReviewCat} value={v as number}
                color={k === 'hardware' ? '#cf1322' : k === 'oversell' ? '#d4380d' : k === 'food_prep' ? '#d48806' : '#3f8600'}
                suffix={`${v} 条 | `} />
            ))}
            <div className="muted">硬件 → 维修排期与更新；服务 → 保洁/管家排班；超卖 → 削房量/提价；餐食 → 厨房产能与备餐量</div>
          </Card>
        </Col>

        <Col span={12}>
          <Card size="small" style={{ marginBottom: 12 }} title="按房型复盘利润与价格策略（ADR/基础价）">
            {data.byRoomType.map((c: any) => (
              <Bar key={c.roomType} label={c.roomType} max={maxType} value={n(c.netIncome)} color="#3b7ca8"
                suffix={`净 ${fmt(n(c.netIncome))} | `} />
            ))}
            <Table size="small" style={{ marginTop: 8 }} pagination={false} rowKey="roomType" dataSource={data.byRoomType}
              columns={[
                { title: '房型', dataIndex: 'roomType' },
                { title: '订单', dataIndex: 'bookings', width: 60 },
                { title: 'ADR', dataIndex: 'adr', width: 90, render: (v: any) => fmt(v) },
                { title: '早餐收入', dataIndex: 'breakfastFee', width: 100, render: (v: any) => fmt(v) },
                { title: '补偿券', dataIndex: 'couponCost', width: 90, render: (v: any) => fmt(v) },
                { title: '净收入', dataIndex: 'netIncome', render: (v: any) => <span className="money">{fmt(v)}</span> },
              ]} />
          </Card>
          <Card size="small" title="异常事件结构与补偿成本">
            {incTypes.map((t) => (
              <Bar key={t} label={INCIDENT_LABEL[t]} max={maxInc} value={data.incidents.byType[t]}
                color="#b05a5a" suffix={`${data.incidents.byType[t]} 次 / 补偿 ${fmt(n(data.incidents.compCostByType[t] || 0))} | `} />
            ))}
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginTop: 12 }}
        title="问题定性：区分价格策略问题 / 履约能力问题 / 个别客诉（指导下一轮调价与排班）">
        {data.diagnosis.map((d: any) => (
          <Alert key={d.roomTypeId} style={{ marginBottom: 8 }}
            type={d.tags.includes('表现正常') ? 'success' : d.tags.includes('履约能力问题') ? 'error' : 'warning'}
            showIcon
            message={<Space wrap>
              <b>{d.name}</b>
              {d.tags.map((t: string) => <Tag key={t} color={t === '履约能力问题' ? 'red' : t === '价格策略问题' ? 'orange' : t === '个别客诉' ? 'blue' : 'green'}>{t}</Tag>)}
              <span className="muted">入住率 {d.occupancy}% · ADR {fmt(d.adr)}（基础价 {fmt(d.basePrice)}，{d.adrRatio >= 1 ? '溢价' : '低于'} {Math.abs(Math.round((d.adrRatio - 1) * 100))}%）</span>
            </Space>}
            description={<Space wrap>
              <span>超卖 {d.oversell} 次</span>
              <span>布草延迟 {d.linenDelay} 次</span>
              <span>早餐不足 {d.breakfastShortage} 次</span>
              <span>硬件故障 {d.roomFault} 次</span>
              <span>差评 {d.badReviews} 条</span>
              <span>补偿成本 <b style={{ color: '#c0392b' }}>{fmt(d.compCost)}</b></span>
            </Space>} />
        ))}
        <div className="muted">在「房态与排房」页可基于以上定性一键生成下轮节假日可售房量与调价建议（超卖→提价，布草/早餐反复出问题→削量留缓冲）。</div>
      </Card>
    </div>
  );
}
