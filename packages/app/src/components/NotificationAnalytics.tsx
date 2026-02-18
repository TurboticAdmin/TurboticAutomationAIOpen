"use client";

import React, { useState, useEffect } from 'react';
import { Card, Statistic, Table, Spin, Row, Col, Select, Tag, Empty, Input } from 'antd';
import { EyeOutlined, UserOutlined, BarChartOutlined, BellOutlined } from '@ant-design/icons';
import { toast } from '@/hooks/use-toast';
import dayjs from 'dayjs';

const { Option } = Select;

interface ClickRecord {
  id: string;
  notificationId: string;
  notificationTitle: string;
  userEmail: string | null;
  userName: string | null;
  source: string;
  clickCount: number;
  firstClickAt: Date;
  lastClickAt: Date;
  ipAddress: string;
}

interface Statistics {
  totalClicks: number;
  totalUniqueViews: number;
  uniqueUserCount: number;
  anonymousViews: number;
}

interface NotificationStats {
  notificationId: string;
  notificationTitle: string;
  totalClicks: number;
  uniqueViews: number;
  uniqueUserCount: number;
  lastClick: Date;
}

interface TopUser {
  email: string;
  name: string | null;
  totalClicks: number;
  lastClick: Date;
}

interface ClicksOverTime {
  date: string;
  totalClicks: number;
  uniqueViews: number;
}

interface AnalyticsData {
  recentClicks: ClickRecord[];
  statistics: Statistics;
  clicksByNotification: NotificationStats[];
  topUsers: TopUser[];
  clicksOverTime: ClicksOverTime[];
}

interface NotificationAnalyticsProps {
  selectedDatabase?: 'prod' | 'test';
  isTestEnvironment?: boolean;
}

const NotificationAnalytics: React.FC<NotificationAnalyticsProps> = ({ 
  selectedDatabase = 'prod', 
  isTestEnvironment = false 
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [notificationFilter, setNotificationFilter] = useState<string>('');

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sourceFilter) params.append('source', sourceFilter);
      if (notificationFilter) params.append('notificationId', notificationFilter);
      if (isTestEnvironment) {
        params.append('database', selectedDatabase);
      }
      params.append('limit', '100');

      const response = await fetch(`/api/admin/notifications/analytics?${params.toString()}`);
      if (response.ok) {
        const result = await response.json();
        setData(result.data);
      } else {
        toast.error('Error', 'Failed to fetch analytics');
      }
    } catch (error) {
      toast.error('Error', 'Error fetching analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [sourceFilter, notificationFilter, selectedDatabase, isTestEnvironment]);

  const clicksColumns = [
    {
      title: 'User',
      dataIndex: 'userEmail',
      key: 'userEmail',
      render: (email: string | null, record: ClickRecord) => (
        email ? (
          <div>
            <div>{record.userName || 'Unknown'}</div>
            <div style={{ fontSize: '12px', color: '#888' }}>{email}</div>
          </div>
        ) : (
          <Tag color="default">Anonymous</Tag>
        )
      ),
    },
    {
      title: 'Notification',
      dataIndex: 'notificationTitle',
      key: 'notificationTitle',
      render: (title: string) => <span style={{ fontWeight: 500 }}>{title}</span>,
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      render: (source: string) => (
        <Tag color={source === 'homepage' ? 'blue' : 'green'}>
          {source === 'homepage' ? 'Homepage' : 'Notification Banner'}
        </Tag>
      ),
    },
    {
      title: 'Clicks',
      dataIndex: 'clickCount',
      key: 'clickCount',
      sorter: (a: ClickRecord, b: ClickRecord) => a.clickCount - b.clickCount,
      render: (count: number) => <Tag color="purple">{count}x</Tag>,
    },
    {
      title: 'First Click',
      dataIndex: 'firstClickAt',
      key: 'firstClickAt',
      render: (date: Date) => dayjs(date).format('MMM D, YYYY HH:mm'),
    },
    {
      title: 'Last Click',
      dataIndex: 'lastClickAt',
      key: 'lastClickAt',
      render: (date: Date) => dayjs(date).format('MMM D, YYYY HH:mm'),
    },
    {
      title: 'IP Address',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      render: (ip: string) => <code style={{ fontSize: '11px' }}>{ip}</code>,
    },
  ];

  const topUsersColumns = [
    {
      title: 'User',
      dataIndex: 'email',
      key: 'email',
      render: (email: string, record: TopUser) => (
        <div>
          <div>{record.name || 'Unknown'}</div>
          <div style={{ fontSize: '12px', color: '#888' }}>{email}</div>
        </div>
      ),
    },
    {
      title: 'Total Clicks',
      dataIndex: 'totalClicks',
      key: 'totalClicks',
      sorter: (a: TopUser, b: TopUser) => a.totalClicks - b.totalClicks,
      render: (count: number) => <Tag color="purple">{count}x</Tag>,
    },
    {
      title: 'Last Click',
      dataIndex: 'lastClick',
      key: 'lastClick',
      render: (date: Date) => dayjs(date).format('MMM D, YYYY HH:mm'),
    },
  ];

  const notificationStatsColumns = [
    {
      title: 'Notification',
      dataIndex: 'notificationTitle',
      key: 'notificationTitle',
      render: (title: string) => <span style={{ fontWeight: 500 }}>{title}</span>,
    },
    {
      title: 'Total Clicks',
      dataIndex: 'totalClicks',
      key: 'totalClicks',
      sorter: (a: NotificationStats, b: NotificationStats) => a.totalClicks - b.totalClicks,
      render: (count: number) => <Tag color="purple">{count}x</Tag>,
    },
    {
      title: 'Unique Views',
      dataIndex: 'uniqueViews',
      key: 'uniqueViews',
      sorter: (a: NotificationStats, b: NotificationStats) => a.uniqueViews - b.uniqueViews,
      render: (count: number) => <Tag color="blue">{count}</Tag>,
    },
    {
      title: 'Unique Users',
      dataIndex: 'uniqueUserCount',
      key: 'uniqueUserCount',
      render: (count: number) => <Tag color="green">{count}</Tag>,
    },
    {
      title: 'Last Click',
      dataIndex: 'lastClick',
      key: 'lastClick',
      render: (date: Date) => dayjs(date).format('MMM D, YYYY HH:mm'),
    },
  ];

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!data) {
    return (
      <Empty description="No analytics data available" />
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Filters */}
      <Card style={{ marginBottom: '24px' }}>
        <Row gutter={16}>
          <Col span={12}>
            <div style={{ marginBottom: '8px', fontWeight: 500 }}>Source</div>
            <Select
              style={{ width: '100%' }}
              placeholder="All Sources"
              allowClear
              value={sourceFilter || undefined}
              onChange={(value) => setSourceFilter(value || '')}
            >
              <Option value="homepage">Homepage</Option>
              <Option value="notification-banner">Notification Banner</Option>
            </Select>
          </Col>
          <Col span={12}>
            <div style={{ marginBottom: '8px', fontWeight: 500 }}>Notification ID</div>
            <Input
              placeholder="Filter by Notification ID"
              value={notificationFilter}
              onChange={(e) => setNotificationFilter(e.target.value)}
              allowClear
            />
          </Col>
        </Row>
      </Card>

      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Clicks"
              value={data.statistics.totalClicks}
              prefix={<BarChartOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Unique Views"
              value={data.statistics.totalUniqueViews}
              prefix={<EyeOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Unique Users"
              value={data.statistics.uniqueUserCount}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Anonymous Views"
              value={data.statistics.anonymousViews}
              prefix={<BellOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Top Notifications */}
      <Card title="Top Notifications by Clicks" style={{ marginBottom: '24px' }}>
        <Table
          dataSource={data.clicksByNotification}
          columns={notificationStatsColumns}
          rowKey="notificationId"
          pagination={{ pageSize: 5 }}
        />
      </Card>

      {/* Top Users */}
      {data.topUsers.length > 0 && (
        <Card title="Top Users by Clicks" style={{ marginBottom: '24px' }}>
          <Table
            dataSource={data.topUsers}
            columns={topUsersColumns}
            rowKey="email"
            pagination={{ pageSize: 5 }}
          />
        </Card>
      )}

      {/* Recent Clicks */}
      <Card title="Recent Click Activity">
        <Table
          dataSource={data.recentClicks}
          columns={clicksColumns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          loading={loading}
        />
      </Card>
    </div>
  );
};

export default NotificationAnalytics;
