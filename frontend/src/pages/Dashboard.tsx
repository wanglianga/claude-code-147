import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Tag, List, Alert, Button } from 'antd';
import {
  HomeOutlined, LoginOutlined, LogoutOutlined, ClearOutlined,
  CoffeeOutlined, SkinOutlined, WarningOutlined, StarOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { api } from '../api';

export default function Dashboard() {
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const date = dayjs().format('YYYY-MM-DD');
  useEffect(() => { api.get(`/dashboard?date=${date}`).then(setData); }, []);
  if (!data) return null;

  return (
    <div>
      {data.openIncidents > 0 && (
        <Alert style={{ marginBottom: 12 }} type="error" showIcon
          message={`今日有 ${data.openIncidents} 件未闭环异常事件（超卖/布草/早餐/硬件等），需在同一住宿链路内处理`}
          action={<Button size="small" danger onClick={() => nav('/incidents')}>去处理</Button>} />
      )}
      <Row gutter={12}>
        <Col span={6}><Card className="stat-card"><Statistic title={`今日在住房量（${date}）`} value={data.inHouseBookings} prefix={<HomeOutlined />} /></Card></Col>
        <Col span={6}><Card className="stat-card"><Statistic title="今日到店 / 离店" value={`${data.arrivalsToday} / ${data.departuresToday}`} /></Card></Col>
        <Col span={6}><Card className="stat-card"><Statistic title="未闭环异常 / 待回复差评" value={`${data.openIncidents} / ${data.pendingReviews}`} valueStyle={{ color: '#cf1322' }} prefix={<WarningOutlined />} /></Card></Col>
        <Col span={6}><Card className="stat-card">
          <Statistic title="布草库存（干净/洗涤中/合计）" value={`${data.linen?.packsAvailable || 0}/${data.linen?.packsInWash || 0}/${data.linen?.packsTotal || 0}`} prefix={<SkinOutlined />} />
        </Card></Col>
      </Row>

      <Row gutter={12} style={{ marginTop: 12 }}>
        <Col span={12}>
          <Card size="small" title="各房型出租情况" extra={<Button type="link" size="small" onClick={() => nav('/availability')}>看房态日历</Button>}>
            <List size="small" dataSource={data.occupancy} renderItem={(o: any) => (
              <List.Item>
                <span>{o.name}</span>
                <span><Tag color={o.occupied >= o.total ? 'red' : 'green'}>{o.occupied}/{o.total} 间</Tag></span>
              </List.Item>
            )} />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="管家与厨房今日任务">
            <Row gutter={8}>
              <Col span={12}>
                <div style={{ marginBottom: 8 }}><ClearOutlined /> 保洁：共 {data.cleaning.total} 单
                  <Tag color="gold">待{data.cleaning.pending}</Tag>
                  <Tag color="red">阻塞{data.cleaning.blocked}</Tag>
                  <Tag color="green">完成{data.cleaning.done}</Tag>
                </div>
                <Button size="small" onClick={() => nav('/housekeeping')}>保洁布草看板</Button>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 8 }}><CoffeeOutlined /> 早餐：{data.breakfast.portions} 份
                  {data.breakfast.shortage > 0 && <Tag color="red">不足{data.breakfast.shortage}</Tag>}
                </div>
                <Button size="small" onClick={() => nav('/kitchen')}>厨房备餐看板</Button>
              </Col>
            </Row>
            {data.breakfast.dietary.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="muted" style={{ marginBottom: 4 }}>今日忌口提醒：</div>
                {data.breakfast.dietary.map((x: any, i: number) => (
                  <Tag key={i} color="orange">{x.bookingCode} {x.guest}：{x.restriction}</Tag>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
