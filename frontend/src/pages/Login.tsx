import { useState } from 'react';
import { Button, Form, Input, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api, setSession } from '../api';

export default function Login() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const onFinish = async (v: any) => {
    setLoading(true);
    try {
      const r = await api.post('/auth/login', v);
      setSession(r.token, r.user);
      message.success(`欢迎回来，${r.user.name}`);
      nav('/');
    } catch { /* api 层已提示 */ } finally { setLoading(false); }
  };
  return (
    <div className="login-bg">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="login-title">🏡 乡宿通</div>
          <div className="muted" style={{ marginTop: 6 }}>乡村民宿旺季房态·保洁·布草·早餐·补偿平台</div>
        </div>
        <Form onFinish={onFinish} initialValues={{ username: 'owner', password: 'owner123' }} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>登 录</Button>
        </Form>
        <div className="muted" style={{ marginTop: 16, lineHeight: 1.8 }}>
          演示账号：<br />
          店主 owner / owner123　管家 housekeeper / house123<br />
          厨房 kitchen / kitchen123
        </div>
      </div>
    </div>
  );
}
