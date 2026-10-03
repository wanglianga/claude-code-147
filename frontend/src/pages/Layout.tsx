import { useState } from 'react';
import { Layout as AntLayout, Menu, Dropdown, Tag } from 'antd';
import {
  DashboardOutlined, CalendarOutlined, UnorderedListOutlined, ClearOutlined,
  CoffeeOutlined, ToolOutlined, WarningOutlined, StarOutlined,
  AccountBookOutlined, BarChartOutlined, LogoutOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getUser } from '../api';

const items = [
  { key: '/', icon: <DashboardOutlined />, label: '旺季总览' },
  { key: '/availability', icon: <CalendarOutlined />, label: '房态与排房' },
  { key: '/bookings', icon: <UnorderedListOutlined />, label: '订单与住宿链路' },
  { key: '/housekeeping', icon: <ClearOutlined />, label: '保洁与布草' },
  { key: '/kitchen', icon: <CoffeeOutlined />, label: '早餐厨房' },
  { key: '/maintenance', icon: <ToolOutlined />, label: '维修房态' },
  { key: '/incidents', icon: <WarningOutlined />, label: '异常事件中心' },
  { key: '/reviews', icon: <StarOutlined />, label: '差评与补偿' },
  { key: '/billing', icon: <AccountBookOutlined />, label: '结算单' },
  { key: '/analytics', icon: <BarChartOutlined />, label: '旺季复盘' },
];

export default function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const user = getUser();
  const [collapsed, setCollapsed] = useState(false);
  const selected = '/' + (loc.pathname.split('/')[1] || '');
  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <AntLayout.Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="dark"
        style={{ background: '#1f3d2c' }}>
        <div style={{ color: '#fff', textAlign: 'center', padding: '16px 0', fontWeight: 700, fontSize: collapsed ? 18 : 17 }}>
          {collapsed ? '🏡' : '🏡 乡宿通'}
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[selected]}
          style={{ background: '#1f3d2c' }}
          items={items}
          onClick={(e) => nav(e.key)} />
      </AntLayout.Sider>
      <AntLayout>
        <AntLayout.Header style={{ background: '#fff', padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600 }}>{items.find((i) => i.key === selected)?.label || '乡宿通'}</div>
          <Dropdown menu={{
            items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: () => { clearSession(); nav('/login'); } }],
          }}>
            <span style={{ cursor: 'pointer' }}>
              <Tag color="green">{user?.role === 'owner' ? '店主' : user?.role === 'housekeeper' ? '管家' : user?.role === 'kitchen' ? '厨房' : user?.role}</Tag>
              {user?.name}
            </span>
          </Dropdown>
        </AntLayout.Header>
        <AntLayout.Content style={{ padding: 16 }}>
          <Outlet />
        </AntLayout.Content>
      </AntLayout>
    </AntLayout>
  );
}
